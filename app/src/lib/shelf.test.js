import { describe, it, expect } from 'vitest'
import { moveItem, applyAction, historyReducer, initHistory, emptyShelf } from './shelf.js'

const ids = (items) => items.map((i) => i.uid).join('')
const abc = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]

describe('moveItem', () => {
  it('moves right', () => expect(ids(moveItem(abc, 0, 3))).toBe('bca'))
  it('moves left', () => expect(ids(moveItem(abc, 2, 0))).toBe('cab'))
  it('drop in place is a no-op', () => {
    expect(moveItem(abc, 1, 1)).toBe(abc)
    expect(moveItem(abc, 1, 2)).toBe(abc)
  })
  it('clamps out-of-range targets', () => expect(ids(moveItem(abc, 0, 99))).toBe('bca'))
})

describe('applyAction', () => {
  const s = { ...emptyShelf(), items: abc.map((i) => ({ ...i, facings: 2 })) }
  it('adds at the end or at a position', () => {
    expect(ids(applyAction(s, { type: 'add', uid: 'd', upc: '1' }).items)).toBe('abcd')
    expect(ids(applyAction(s, { type: 'add', uid: 'd', upc: '1', index: 1 }).items)).toBe('adbc')
  })
  it('keeps facings between 1 and 99', () => {
    expect(applyAction(s, { type: 'facings', uid: 'a', facings: 0 }).items[0].facings).toBe(1)
    expect(applyAction(s, { type: 'facings', uid: 'a', facings: 500 }).items[0].facings).toBe(99)
  })
  it('removes', () => expect(ids(applyAction(s, { type: 'remove', uid: 'b' }).items)).toBe('ac'))
})

describe('undo / redo', () => {
  it('undoes and redoes changes in order', () => {
    let h = initHistory({ ...emptyShelf(), items: abc })
    h = historyReducer(h, { type: 'remove', uid: 'a' })
    h = historyReducer(h, { type: 'remove', uid: 'b' })
    expect(ids(h.present.items)).toBe('c')
    h = historyReducer(h, { type: 'undo' })
    expect(ids(h.present.items)).toBe('bc')
    h = historyReducer(h, { type: 'undo' })
    expect(ids(h.present.items)).toBe('abc')
    h = historyReducer(h, { type: 'redo' })
    expect(ids(h.present.items)).toBe('bc')
  })
  it('a new change clears redo', () => {
    let h = initHistory({ ...emptyShelf(), items: abc })
    h = historyReducer(h, { type: 'remove', uid: 'a' })
    h = historyReducer(h, { type: 'undo' })
    h = historyReducer(h, { type: 'remove', uid: 'c' })
    expect(h.future).toHaveLength(0)
  })
  it('does not record no-op moves', () => {
    const h0 = initHistory({ ...emptyShelf(), items: abc })
    expect(historyReducer(h0, { type: 'move', uid: 'b', insertBefore: 1 })).toBe(h0)
  })
})
