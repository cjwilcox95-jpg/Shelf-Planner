import { describe, it, expect } from 'vitest'
import { makeAisleView, splitAisleView, aisleRows, mergeAisles, newAisle } from './aisle.js'
import { applyPlanAction, moveTo, shelfLabel, TRAY } from './plan.js'

const shelf = (id, items, widthIn = 48) => ({ id, widthIn, depthIn: 24, clearanceIn: 12, items: items.map((u) => ({ uid: u, upc: u, facings: 1 })) })
const plans = {
  A: { id: 'A', name: 'Laundry A', updatedAt: '2026-01-01', shelves: [shelf('a1', ['x', 'y']), shelf('a2', ['z'])], tray: [] },
  B: { id: 'B', name: 'Laundry B', updatedAt: '2026-01-02', shelves: [shelf('b1', ['p']), shelf('b2', []), shelf('b3', ['q'])], tray: [{ uid: 't', upc: 't', facings: 1 }] },
}
const aisle = { id: 'L', name: 'Laundry aisle', planIds: ['A', 'B', 'gone'], updatedAt: '2025-12-01' }

describe('aisle view', () => {
  const v = makeAisleView(aisle, plans)
  it('joins the sections left to right and skips a deleted one', () => {
    expect(v.sections.map((s) => [s.letter, s.planId, s.offsetIn])).toEqual([['A', 'A', 0], ['B', 'B', 48]])
    expect(v.shelves.map((s) => s.id)).toEqual(['a1', 'a2', 'b1', 'b2', 'b3'])
    expect(v.updatedAt).toBe('2026-01-02')
  })
  it('lines up shelves by level from the bottom, top level first', () => {
    const rows = aisleRows(v)
    expect(rows.map((r) => r.map((c) => c?.shelf.id ?? null))).toEqual([[null, 'b3'], ['a2', 'b2'], ['a1', 'b1']])
  })
  it('labels shelves by section', () => {
    expect(shelfLabel(v, 'b3')).toBe('B · Shelf 3 (top)')
    expect(shelfLabel(v, 'a1')).toBe('A · Shelf 1 (bottom)')
  })
  it('a product moved from section A to section B is saved in B and gone from A', () => {
    const moved = moveTo(v, 'y', 'b1', 0)
    const out = splitAisleView(moved, plans, 'now')
    expect(out.A.shelves[0].items.map((i) => i.uid)).toEqual(['x'])
    expect(out.B.shelves[0].items.map((i) => i.uid)).toEqual(['y', 'p'])
    expect(out.A.updatedAt).toBe('now')
  })
  it('only plans that changed are saved again', () => {
    const out = splitAisleView(moveTo(v, 'x', 'a1', 2), plans, 'now') // x moved after y, within A
    expect(Object.keys(out)).toEqual(['A'])
  })
  it('a product taken off the shelf stays with its own section', () => {
    const off = moveTo(v, 'z', TRAY, 0)
    const out = splitAisleView(off, plans, 'now')
    expect(out.A.tray.map((i) => i.uid)).toEqual(['z'])
    expect(out.B).toBeUndefined() // B's tray item t stayed in B, nothing changed there
  })
  it('"every shelf" sizes change only that section; adding or removing shelves is done in the section itself', () => {
    const r = applyPlanAction(v, { type: 'shelf', shelfId: 'b2', all: true, changes: { clearanceIn: 10 } })
    expect(r.shelves.map((s) => s.clearanceIn)).toEqual([12, 12, 10, 10, 10])
    expect(applyPlanAction(v, { type: 'addShelf', position: 'top' })).toBe(v)
    expect(applyPlanAction(v, { type: 'removeShelf', shelfId: 'a1' })).toBe(v)
  })
})

describe('mergeAisles', () => {
  it('adds new aisles and keeps the newer copy', () => {
    const mine = { L: { ...aisle, updatedAt: '2026-02-01' } }
    const merged = mergeAisles(mine, [{ ...aisle, name: 'old', updatedAt: '2026-01-01' }, newAisle('Pickles', ['P'])])
    expect(merged.L.updatedAt).toBe('2026-02-01')
    expect(Object.values(merged).map((a) => a.name).sort()).toEqual(['Laundry aisle', 'Pickles'])
  })
})
