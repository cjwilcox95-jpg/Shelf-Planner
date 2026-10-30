// Checks for the problems found in the code review of 2026-10-30, so they stay fixed.
import { describe, it, expect } from 'vitest'
import { applyPlanAction, duplicatePlan, newPlan, uniqueUids } from './plan.js'
import { makeAisleView, splitAisleView } from './aisle.js'
import { cleanCatalog, cleanPlan } from './clean.js'
import { mergePlans } from './backup.js'
import { makeProducts } from './products.js'
import { search, buildIndex } from './search.js'
import { pdfText } from './pdf.js'
import { cleanGuessEdits, packageTypeFor, withEdits } from './guess.js'
import { parseMovementCsv } from './movement.js'
import { parseInches } from './tape.js'

const planWith = (uids) => {
  const p = newPlan({ name: 'A', shelves: 1 })
  p.shelves[0].items = uids.map((u) => ({ uid: u, upc: '041500000527', facings: 1 }))
  return p
}

describe('a copied plan never shares products with its original', () => {
  it('gives every product in the copy its own id', () => {
    const a = planWith(['i1', 'i2'])
    const b = duplicatePlan(a)
    const ids = (p) => p.shelves.flatMap((s) => s.items.map((i) => i.uid))
    expect(ids(b).some((u) => ids(a).includes(u))).toBe(false)
  })
  it('repairs plans saved by older versions, so an aisle with both changes only the one you touched', () => {
    const a = planWith(['i1'])
    const old = { ...JSON.parse(JSON.stringify(a)), id: 'pB', shelves: a.shelves.map((s) => ({ ...JSON.parse(JSON.stringify(s)), id: 'sB' })) }
    const { plans, changed } = uniqueUids({ [a.id]: a, pB: old })
    expect(changed).toBe(1)
    expect(plans[a.id]).toBe(a) // the first plan keeps its ids
    const view = makeAisleView({ id: 'x', name: 'Aisle', planIds: [a.id, 'pB'] }, plans)
    const bUid = plans.pB.shelves[0].items[0].uid
    const out = splitAisleView(applyPlanAction(view, { type: 'facings', uid: bUid, facings: 3 }), plans, 'now')
    expect(Object.keys(out)).toEqual(['pB'])
    expect(out.pB.shelves[0].items[0].facings).toBe(3)
  })
})

describe('imported files that are broken do not crash or sneak data in', () => {
  it('a backup plan with a broken shelf or product is cleaned, not crashed on', () => {
    const p = cleanPlan({ id: 'p', shelves: [null, { widthIn: 'wide', items: [{ uid: 'u' }, { uid: 'v', upc: '041500000527', high: 'x' }] }], tray: [{ uid: 't' }] })
    expect(p.shelves).toHaveLength(1)
    expect(p.shelves[0].widthIn).toBe(48)
    expect(p.shelves[0].items.map((i) => i.uid)).toEqual(['v']) // no UPC: left out
    expect(p.shelves[0].items[0].high).toBeUndefined()
    expect(p.tray).toEqual([])
    expect(mergePlans({}, [{ id: 'q', shelves: [null] }]).counts.skipped).toBe(1)
  })
  it('a product with no name still shows', () => {
    const products = makeProducts({ items: [], classNames: {}, subclassNames: {} })
    expect(products.info({ uid: 'u', upc: undefined }).description).toBe('')
  })
  it('the store-data file keeps only text UPCs and plain-text class names', () => {
    const cat = cleanCatalog({ items: [{ upc: 123456789012, description: 'NUM' }, { upc: '036800000001' }], classNames: { 1: { caseCost: 9.99 }, 2: 'Soup' } })
    expect(cat.items.map((i) => i.upc)).toEqual(['036800000001'])
    expect(cat.items[0].description).toBe('')
    expect(cat.classNames).toEqual({ 2: 'Soup' })
    expect(JSON.stringify(cat)).not.toMatch(/cost/i)
    expect(() => search(buildIndex({ ...cat, items: [...cat.items, { upc: '036800000002' }] }), '0368')).not.toThrow()
  })
  it('default-guess edits keep known types and sensible sizes only', () => {
    expect(cleanGuessEdits({ can: { w: 3.2, h: 'abc', caseCost: 4.2 }, nope: { w: 1 } })).toEqual({ can: { w: 3.2 } })
    expect(withEdits({ can: { w: 'abc' } }).find((p) => p.id === 'can').edited).toBeFalsy()
  })
})

describe('small fixes', () => {
  it('a long PDF title never ends in half an escape', () => {
    const t = pdfText(`${'x'.repeat(199)}(AFI)`)
    expect(t.endsWith('\\')).toBe(false)
    expect(t).toMatch(/\\\($/)
  })
  it('Gain Flings are guessed as a bag of pods', () => {
    expect(packageTypeFor('GAIN FLINGS ORIG 35CT', undefined, 'LAUNDRY DETERGENT').id).toBe('podbag')
  })
  it('a blank units cell is not counted as 0 sold', () => {
    const r = parseMovementCsv('UPC,Units\n036800476370,\n041500000527,12\n')
    expect(r.items['036800476370']).toBeUndefined()
    expect(r.skipped).toBe(1)
  })
  it('tape entries with "inch" or "in." are read', () => {
    expect(parseInches('2 inch')).toBe(2)
    expect(parseInches('2 in.')).toBe(2)
    expect(parseInches('2 3/4 inches')).toBe(2.75)
  })
})
