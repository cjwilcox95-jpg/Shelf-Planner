import { describe, it, expect } from 'vitest'
import { cleanCatalog, cleanPlan } from './clean.js'

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
