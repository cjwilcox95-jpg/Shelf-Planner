import { describe, it, expect } from 'vitest'
import {
  TRAY, newPlan, planFromAfi, planFromOldShelf, duplicatePlan, findItem, moveTo,
  applyPlanAction, historyReducer, initHistory, shelfLabel,
} from './plan.js'

// Two shelves: bottom has a b c, top has x y
function sample() {
  const p = newPlan({ name: 'Test', shelves: 2 })
  p.shelves[0].items = ['a', 'b', 'c'].map((uid) => ({ uid, upc: uid, facings: 1 }))
  p.shelves[1].items = ['x', 'y'].map((uid) => ({ uid, upc: uid, facings: 2 }))
  return p
}
const ids = (items) => items.map((i) => i.uid).join('')
const [BOT, TOP] = [0, 1]

describe('moving items', () => {
  it('reorders within a shelf', () => {
    const p = sample()
    expect(ids(moveTo(p, 'a', p.shelves[BOT].id, 3).shelves[BOT].items)).toBe('bca')
    expect(ids(moveTo(p, 'c', p.shelves[BOT].id, 0).shelves[BOT].items)).toBe('cab')
  })
  it('a drop where it already was changes nothing', () => {
    const p = sample()
    expect(moveTo(p, 'b', p.shelves[BOT].id, 1)).toBe(p)
    expect(moveTo(p, 'b', p.shelves[BOT].id, 2)).toBe(p)
  })
  it('moves between shelves', () => {
    const p = sample()
    const q = moveTo(p, 'b', p.shelves[TOP].id, 1)
    expect(ids(q.shelves[BOT].items)).toBe('ac')
    expect(ids(q.shelves[TOP].items)).toBe('xby')
  })
  it('moves to and from the tray', () => {
    const p = sample()
    const q = applyPlanAction(p, { type: 'takeOff', uid: 'c' })
    expect(ids(q.tray)).toBe('c')
    expect(ids(q.shelves[BOT].items)).toBe('ab')
    const r = moveTo(q, 'c', q.shelves[TOP].id, 0)
    expect(ids(r.tray)).toBe('')
    expect(ids(r.shelves[TOP].items)).toBe('cxy')
  })
  it('finds items anywhere', () => {
    const p = applyPlanAction(sample(), { type: 'takeOff', uid: 'x' })
    expect(findItem(p, 'x').where).toBe(TRAY)
    expect(findItem(p, 'b')).toMatchObject({ where: p.shelves[BOT].id, index: 1 })
    expect(findItem(p, 'nope')).toBeNull()
  })
})

describe('plan actions', () => {
  it('adds to a chosen shelf and position', () => {
    const p = sample()
    const q = applyPlanAction(p, { type: 'add', shelfId: p.shelves[TOP].id, index: 1, uid: 'n', upc: 'n' })
    expect(ids(q.shelves[TOP].items)).toBe('xny')
  })
  it('changes facings anywhere, kept between 1 and 99', () => {
    const p = sample()
    expect(findItem(applyPlanAction(p, { type: 'facings', uid: 'y', facings: 4 }), 'y').item.facings).toBe(4)
    expect(findItem(applyPlanAction(p, { type: 'facings', uid: 'y', facings: 0 }), 'y').item.facings).toBe(1)
  })
  it('changes one shelf or every shelf', () => {
    const p = sample()
    const one = applyPlanAction(p, { type: 'shelf', shelfId: p.shelves[TOP].id, changes: { clearanceIn: 9 } })
    expect(one.shelves.map((s) => s.clearanceIn)).toEqual([12, 9])
    const all = applyPlanAction(p, { type: 'shelf', all: true, changes: { depthIn: 20 } })
    expect(all.shelves.map((s) => s.depthIn)).toEqual([20, 20])
  })
  it('adds a shelf on top with the same size, and removing a shelf keeps its products in the tray', () => {
    let p = sample()
    p = applyPlanAction(p, { type: 'shelf', all: true, changes: { widthIn: 96 } })
    p = applyPlanAction(p, { type: 'addShelf', position: 'top' })
    expect(p.shelves).toHaveLength(3)
    expect(p.shelves[2].widthIn).toBe(96)
    const q = applyPlanAction(p, { type: 'removeShelf', shelfId: p.shelves[BOT].id })
    expect(q.shelves).toHaveLength(2)
    expect(ids(q.tray)).toBe('abc')
  })
  it('never removes the last shelf', () => {
    const p = newPlan({ shelves: 1 })
    expect(applyPlanAction(p, { type: 'removeShelf', shelfId: p.shelves[0].id })).toBe(p)
  })
  it('deletes for good only when asked', () => {
    const p = applyPlanAction(sample(), { type: 'takeOff', uid: 'a' })
    expect(ids(applyPlanAction(p, { type: 'deleteItem', uid: 'a' }).tray)).toBe('')
  })
})

describe('labels, copies and AFI', () => {
  it('numbers shelves from the bottom like AFI', () => {
    const p = sample()
    expect(shelfLabel(p, p.shelves[BOT].id)).toBe('Shelf 1 (bottom)')
    expect(shelfLabel(p, p.shelves[TOP].id)).toBe('Shelf 2 (top)')
  })
  it('duplicates into an independent copy', () => {
    const p = sample()
    const c = duplicatePlan(p, 'Proposed')
    expect(c.id).not.toBe(p.id)
    expect(c.name).toBe('Proposed')
    c.shelves[0].items.pop()
    expect(p.shelves[0].items).toHaveLength(3)
  })
  it('builds a whole section from an AFI reset', () => {
    const reset = {
      name: 'Ketchup - Mustard', date: '2024-01-09', widthFt: 4,
      shelves: [
        { shelf: 2, depthIn: 19, items: [{ upc: '2', facings: 2, description: 'B' }] },
        { shelf: 1, depthIn: 20, items: [{ upc: '1', facings: 3, description: 'A' }] },
      ],
      unallocated: [{ upc: '9', facings: 1, description: 'LEFT OFF' }],
    }
    const p = planFromAfi(reset)
    expect(p.shelves.map((s) => s.items[0].upc)).toEqual(['1', '2']) // bottom first
    expect(p.shelves.every((s) => s.widthIn === 48 && s.depthIn === 24)).toBe(true)
    expect(p.tray[0].description).toBe('LEFT OFF')
    expect(p.note).toContain('19–20 in deep')
  })
  it('turns an old one-shelf save into a plan', () => {
    const p = planFromOldShelf({ name: 'Old', widthIn: 36, depthIn: 20, clearanceIn: 10, items: [{ uid: 'a', upc: 'a', facings: 1 }] })
    expect(p.shelves).toHaveLength(1)
    expect(p.shelves[0]).toMatchObject({ widthIn: 36, depthIn: 20, clearanceIn: 10 })
  })
})

describe('undo / redo', () => {
  it('undoes and redoes, and stamps the change time', () => {
    let h = initHistory(sample())
    h = historyReducer(h, { type: 'takeOff', uid: 'a', now: 'T1' })
    h = historyReducer(h, { type: 'move', uid: 'x', to: h.present.shelves[BOT].id, insertBefore: 0, now: 'T2' })
    expect(h.present.updatedAt).toBe('T2')
    h = historyReducer(h, { type: 'undo' })
    expect(ids(h.present.shelves[TOP].items)).toBe('xy')
    h = historyReducer(h, { type: 'undo' })
    expect(ids(h.present.tray)).toBe('')
    h = historyReducer(h, { type: 'redo' })
    expect(ids(h.present.tray)).toBe('a')
  })
  it('opening another plan starts a fresh undo list', () => {
    let h = historyReducer(initHistory(sample()), { type: 'takeOff', uid: 'a' })
    h = historyReducer(h, { type: 'open', plan: newPlan() })
    expect(h.past).toHaveLength(0)
  })
  it('does not record changes that change nothing', () => {
    const h = initHistory(sample())
    expect(historyReducer(h, { type: 'move', uid: 'b', to: h.present.shelves[BOT].id, insertBefore: 1 })).toBe(h)
  })
})

describe('stacking and empty spaces', () => {
  it('sets how many high, and 1 removes it', () => {
    const p = sample()
    const q = applyPlanAction(p, { type: 'high', uid: 'a', high: 2 })
    expect(findItem(q, 'a').item.high).toBe(2)
    expect('high' in findItem(applyPlanAction(q, { type: 'high', uid: 'a', high: 1 }), 'a').item).toBe(false)
  })
  it('adds an empty space and changes its width', () => {
    const p = sample()
    const q = applyPlanAction(p, { type: 'addGap', shelfId: p.shelves[BOT].id, index: 1, uid: 'g', widthIn: 3 })
    expect(ids(q.shelves[BOT].items)).toBe('agbc')
    const r = applyPlanAction(q, { type: 'gapWidth', uid: 'g', widthIn: 4.6 })
    expect(findItem(r, 'g').item.widthIn).toBe(4.5) // rounded to a quarter inch
  })
  it('taking an empty space off the shelf removes it instead of filling the tray', () => {
    const p = sample()
    const withGap = applyPlanAction(p, { type: 'addGap', shelfId: p.shelves[BOT].id, uid: 'g2' })
    expect(findItem(withGap, 'g2').where).toBe(p.shelves[BOT].id)
    const q = applyPlanAction(withGap, { type: 'takeOff', uid: 'g2' })
    expect(findItem(q, 'g2')).toBe(null)
    expect(q.tray.length).toBe(0)
    expect(moveTo(withGap, 'g2', TRAY, 0)).toBe(withGap) // dragging it to the tray does nothing
  })
})

describe('fixes from the code review', () => {
  it('removing a shelf sends its products to the tray but not its empty spaces', () => {
    const p = sample()
    const withGap = applyPlanAction(p, { type: 'addGap', shelfId: p.shelves[BOT].id, uid: 'g' })
    const q = applyPlanAction(withGap, { type: 'removeShelf', shelfId: p.shelves[BOT].id })
    expect(ids(q.tray)).toBe('abc')
  })
  it('undo and redo get a new "changed" time, so an older backup cannot bring an undone change back', () => {
    let h = initHistory({ ...sample(), updatedAt: '2026-01-01T09:59:00Z' })
    h = historyReducer(h, { type: 'facings', uid: 'a', facings: 3, now: '2026-01-01T10:05:00Z' })
    h = historyReducer(h, { type: 'undo', now: '2026-01-01T10:10:00Z' })
    expect(findItem(h.present, 'a').item.facings).toBe(1)
    expect(h.present.updatedAt).toBe('2026-01-01T10:10:00Z')
    h = historyReducer(h, { type: 'redo', now: '2026-01-01T10:11:00Z' })
    expect(h.present.updatedAt).toBe('2026-01-01T10:11:00Z')
  })
  it('an AFI reset with no shelves still makes a plan with one shelf', () => {
    const p = planFromAfi({ name: 'Empty', date: '2024', widthFt: 4, shelves: [], unallocated: [] })
    expect(p.shelves).toHaveLength(1)
    expect(p.note).not.toMatch(/Infinity/)
  })
})
