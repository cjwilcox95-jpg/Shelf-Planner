import { describe, it, expect } from 'vitest'
import { cleanCatalog, cleanPlan, healthyPlan, repairPlans } from './clean.js'

describe('cleanCatalog', () => {
  const doc = {
    kind: 'shelf-planner-catalog', version: 1, built: '2026-10-14', sources: ['a'], classNames: {}, subclassNames: {},
    items: [{ upc: '036800083004', description: 'KETCHUP', size: '20 OZ', caseCost: 12.5, retail: 2.99 }, { upc: 'bad' }],
    resets: [
      { id: 'r1', name: 'Ketchup', date: '2024', widthFt: 4, shelves: [{ shelf: 1, depthIn: 20, items: [{ upc: '036800083004', facings: 2, unitCost: 1 }] }], unallocated: [] },
      { id: 'r2', name: 'Empty', shelves: [] },
    ],
    margins: { x: 1 },
  }
  const c = cleanCatalog(doc)
  it('drops any money field, even one added by hand', () => {
    expect(JSON.stringify(c)).not.toMatch(/cost|retail|margin|12\.5|2\.99/i)
    expect(c.items).toEqual([{ upc: '036800083004', description: 'KETCHUP', size: '20 OZ' }])
    expect(c.resets[0].shelves[0].items).toEqual([{ upc: '036800083004', facings: 2 }])
  })
  it('leaves out an AFI reset with no shelves', () => {
    expect(c.resets.map((r) => r.id)).toEqual(['r1'])
  })
})

describe('cleanPlan', () => {
  it('keeps known fields, drops others, and never keeps an empty space in the tray', () => {
    const p = cleanPlan({
      id: 'p', name: 'X', createdAt: 't', updatedAt: 't', price: 3,
      shelves: [{ id: 's', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [{ uid: 'a', upc: '1', facings: 2, retail: 4 }, { uid: 'g', kind: 'gap', widthIn: 3 }] }],
      tray: [{ uid: 'g2', kind: 'gap', widthIn: 2 }, { uid: 'b', upc: '2', facings: 0 }],
    })
    expect(p).toEqual({
      id: 'p', name: 'X', createdAt: 't', updatedAt: 't',
      shelves: [{ id: 's', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [{ uid: 'a', upc: '1', facings: 2 }, { uid: 'g', kind: 'gap', widthIn: 3 }] }],
      tray: [{ uid: 'b', upc: '2', facings: 1 }],
    })
  })
})

describe('AFI sizes in the store data', () => {
  it('keeps plain sizes and drops anything else', () => {
    const c = cleanCatalog({ items: [], resets: [], afiSizes: {
      '036800083004': { w: 3.6, h: 7, d: 2.2, reset: 'Ketchup', date: '2024-01-09', cost: 1.5 },
      '036800083005': { w: 'x', h: 7 },
      bad: { w: 1, h: 1 },
    } })
    expect(c.afiSizes).toEqual({ '036800083004': { w: 3.6, h: 7, d: 2.2, reset: 'Ketchup', date: '2024-01-09' } })
  })
})

describe('plans saved on the phone are checked before use', () => {
  const good = { id: 'p1', name: 'Ketchup', note: '', shelves: [{ id: 's1', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [{ uid: 'i1', upc: '400000000001', facings: 2 }, { uid: 'g1', kind: 'gap', widthIn: 2 }] }], tray: [] }
  it('a healthy plan is passed on untouched (the very same object)', () => {
    expect(healthyPlan(good)).toBe(true)
    const r = repairPlans({ p1: good })
    expect(r.plans.p1).toBe(good)
    expect(r).toMatchObject({ repaired: [], dropped: 0 })
  })
  it('a damaged plan is repaired: broken products and shelves go, missing sizes get the standard ones', () => {
    const bad = {
      id: 'p2', name: 'Half saved',
      shelves: [null, { widthIn: 'wide', depthIn: 24, clearanceIn: 12, items: [{ uid: 'i1', upc: '400000000001', facings: 0 }, { uid: 'x' }, 'junk'] }],
    }
    expect(healthyPlan(bad)).toBe(false)
    const r = repairPlans({ p1: good, p2: bad })
    expect(r.repaired).toEqual(['Half saved'])
    expect(r.plans.p1).toBe(good)
    expect(healthyPlan(r.plans.p2)).toBe(true)
    expect(r.plans.p2.shelves).toHaveLength(1)
    expect(r.plans.p2.shelves[0]).toMatchObject({ widthIn: 48, items: [{ uid: 'i1', upc: '400000000001', facings: 1 }] })
    expect(r.plans.p2.tray).toEqual([])
  })
  it('a plan with nothing left to draw is left out, and nonsense is ignored', () => {
    const r = repairPlans({ a: { id: 'a', name: 'Empty', shelves: [] }, b: 'text', c: null, d: { id: 'd', name: 'No shelves' } })
    expect(r.plans).toEqual({})
    expect(r.dropped).toBe(4)
    expect(repairPlans(undefined)).toEqual({ plans: {}, repaired: [], dropped: 0 })
  })
  it('a plan saved under the wrong key gets that key as its id', () => {
    const r = repairPlans({ k9: good })
    expect(r.plans.k9.id).toBe('k9')
    expect(r.repaired).toEqual(['Ketchup'])
  })
  it('sets from a store-data file always have a name and a width; plans always have a name', () => {
    const cat = cleanCatalog({ items: [{ upc: '400000000001' }], resets: [{ shelves: [{ shelf: 1, depthIn: 20, items: [] }] }] })
    expect(cat.resets[0]).toMatchObject({ name: 'Set', widthFt: 4, date: '' })
    expect(cleanPlan({ id: 'p', shelves: [] }).name).toBe('Plan')
  })
})
