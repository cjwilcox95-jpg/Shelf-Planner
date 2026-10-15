import { describe, it, expect } from 'vitest'
import { comparePlans, changeRows, changeCount } from './compare.js'

const shelf = (items, over = {}) => ({ id: Math.random().toString(36), widthIn: 48, depthIn: 24, clearanceIn: 12, items, ...over })
const it_ = (upc, facings = 1, extra = {}) => ({ uid: `${upc}-${Math.random()}`, upc, facings, ...extra })
const products = { info: (i) => ({ description: `Name ${i.upc}`, size: '20 OZ' }) }

// current: bottom = A B C D, top = E F ; tray empty
const current = {
  shelves: [shelf([it_('A'), it_('B', 2), it_('C'), it_('D')]), shelf([it_('E'), it_('F')])],
  tray: [],
}
// proposed: bottom = A C B(3 facings) G, top = E D F(2 high), F was not changed in facings; X cut to tray
const proposed = {
  shelves: [
    shelf([it_('A'), it_('C'), it_('B', 3), it_('G')]),
    shelf([it_('E'), { uid: 'gap', kind: 'gap', widthIn: 2 }, it_('D'), it_('F', 1, { high: 2 })], { clearanceIn: 10.5 }),
  ],
  tray: [],
}

describe('comparePlans', () => {
  const c = comparePlans(current, proposed)
  it('finds new products', () => {
    expect(c.added.map((x) => x.upc)).toEqual(['G'])
    expect(c.added[0].after).toMatchObject({ shelf: 1, pos: 4 })
  })
  it('finds products moved to another shelf', () => {
    expect(c.movedShelf.map((x) => [x.upc, x.before.shelf, x.after.shelf])).toEqual([['D', 1, 2]])
  })
  it('finds products that slid along the same shelf, not the ones that kept their order', () => {
    // bottom: before A1 B2 C3, after A1 C2 B3 -> only one of B/C has to move; F stays after E (the gap does not count)
    expect(c.movedAlong).toHaveLength(1)
    expect(['B', 'C']).toContain(c.movedAlong[0].upc)
  })
  it('finds facings and stacking changes', () => {
    expect(c.facings.map((x) => [x.upc, x.before.facings, x.after.facings, x.after.high])).toEqual([['B', 2, 3, 1], ['F', 1, 1, 2]])
  })
  it('finds shelf size changes', () => {
    expect(c.shelves).toEqual([{ shelf: 2, text: 'clearance 12 → 10.5 in' }])
  })
  it('counts unchanged products', () => {
    expect(c.same).toBe(3) // A, E, and whichever of B/C did not have to slide (C)
    expect(changeCount(c)).toBe(1 + 0 + 1 + 1 + 2 + 1)
  })
  it('a product taken off goes on the "take out" list', () => {
    const cut = { ...proposed, shelves: [shelf([it_('A')]), proposed.shelves[1]], tray: [it_('C')] }
    const r = comparePlans(current, cut)
    expect(r.removed.map((x) => [x.upc, x.toTray])).toEqual([['B', false], ['C', true]])
  })
  it('two identical plans have no changes', () => {
    const r = comparePlans(current, current)
    expect(changeCount(r)).toBe(0)
    expect(changeRows(r, products)).toEqual([{ type: 'note', text: 'No changes: the two plans are the same.' }])
  })
})

describe('changeRows', () => {
  it('groups the changes with headings for the printed list', () => {
    const rows = changeRows(comparePlans(current, proposed), products)
    const headings = rows.filter((r) => r.type === 'heading').map((r) => r.text)
    expect(headings).toEqual(['Add (1)', 'Move to another shelf (1)', 'Move along the same shelf (1)', 'Change facings (2)', 'Shelf changes (1)'])
    const add = rows.find((r) => r.cells?.[0] === 'Add')
    expect(add.cells).toEqual(['Add', 'Name G', '20 OZ', 'new', 'shelf 1, #4, 1 facing'])
  })
})
