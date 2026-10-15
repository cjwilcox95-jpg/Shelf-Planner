import { describe, it, expect } from 'vitest'
import { itemWidth, unitsDeep, checkShelf, checkPlan, insertIndexAt, fmtIn } from './fit.js'

const shelf = (items, over = {}) => ({ widthIn: 48, depthIn: 24, clearanceIn: 12, items, ...over })
const dimsTable = {
  ketchup20: { w: 2.75, h: 8.5, d: 2.1 },
  jug64: { w: 4.0, h: 12.5, d: 3.1 },
  deep: { w: 6, h: 6, d: 26 },
}
const dimsOf = (item) => dimsTable[item.upc]

describe('itemWidth', () => {
  it('is product width times facings', () => {
    expect(itemWidth(2.75, 3)).toBeCloseTo(8.25)
  })
  it('is 0 for missing width or zero facings', () => {
    expect(itemWidth(undefined, 3)).toBe(0)
    expect(itemWidth(2.75, 0)).toBe(0)
  })
})

describe('unitsDeep', () => {
  it('counts whole units front to back', () => {
    expect(unitsDeep(24, 2.1)).toBe(11) // 24 / 2.1 = 11.4
    expect(unitsDeep(24, 3.1)).toBe(7)
  })
  it('counts an exact fit', () => {
    expect(unitsDeep(24, 3)).toBe(8)
    expect(unitsDeep(19.2, 3.2)).toBe(6) // 6.000000001 floating-point noise
  })
  it('is 0 when the product is deeper than the shelf', () => {
    expect(unitsDeep(24, 26)).toBe(0)
  })
})

describe('checkShelf', () => {
  it('adds up inches used and remaining', () => {
    const r = checkShelf(shelf([
      { uid: 'a', upc: 'ketchup20', facings: 3 }, // 8.25
      { uid: 'b', upc: 'jug64', facings: 2 }, //       8.00
    ]), dimsOf)
    expect(r.usedIn).toBeCloseTo(16.25)
    expect(r.remainingIn).toBeCloseTo(31.75)
    expect(r.overIn).toBe(0)
    expect(r.isOver).toBe(false)
    expect(r.percentUsed).toBeCloseTo(33.85, 1)
  })

  it('places items left to right', () => {
    const r = checkShelf(shelf([
      { uid: 'a', upc: 'ketchup20', facings: 2 },
      { uid: 'b', upc: 'jug64', facings: 1 },
    ]), dimsOf)
    expect(r.items.map((i) => i.xIn)).toEqual([0, 5.5])
  })

  it('reports how far over a full shelf is, without blocking', () => {
    // 12 facings of a 4 in jug = 48, plus 2 x 2.75 = 5.5 over
    const r = checkShelf(shelf([
      { uid: 'a', upc: 'jug64', facings: 12 },
      { uid: 'b', upc: 'ketchup20', facings: 2 },
    ]), dimsOf)
    expect(r.isOver).toBe(true)
    expect(r.overIn).toBeCloseTo(5.5)
    expect(r.remainingIn).toBe(0)
    expect(r.items[1].pastEdge).toBe(true)
    expect(r.items[0].pastEdge).toBe(false)
  })

  it('is exactly full, not over, at 48.0 in', () => {
    const r = checkShelf(shelf([{ uid: 'a', upc: 'jug64', facings: 12 }]), dimsOf)
    expect(r.isOver).toBe(false)
    expect(r.remainingIn).toBeCloseTo(0)
  })

  it('flags products deeper than the shelf and taller than the clearance', () => {
    const r = checkShelf(shelf([
      { uid: 'a', upc: 'deep', facings: 1 },
      { uid: 'b', upc: 'jug64', facings: 1 },
      { uid: 'c', upc: 'ketchup20', facings: 1 },
    ]), dimsOf)
    expect(r.items[0].tooDeep).toBe(true)
    expect(r.items[0].unitsDeep).toBe(0)
    expect(r.items[1].tooTall).toBe(true) // 12.5 tall, 12 clearance
    expect(r.items[2].tooTall).toBe(false)
    expect(r.items[2].tooDeep).toBe(false)
  })

  it('works out capacity as facings x units deep', () => {
    const r = checkShelf(shelf([{ uid: 'a', upc: 'ketchup20', facings: 3 }]), dimsOf)
    expect(r.items[0].unitsDeep).toBe(11)
    expect(r.items[0].capacity).toBe(33)
  })

  it('uses the shelf depth it is given (AFI shelves are 19 in)', () => {
    const r = checkShelf(shelf([{ uid: 'a', upc: 'ketchup20', facings: 1 }], { depthIn: 19 }), dimsOf)
    expect(r.items[0].unitsDeep).toBe(9)
  })

  it('handles an empty shelf', () => {
    const r = checkShelf(shelf([]), dimsOf)
    expect(r.usedIn).toBe(0)
    expect(r.remainingIn).toBe(48)
  })
})

describe('insertIndexAt', () => {
  const placed = [
    { uid: 'a', xIn: 0, widthIn: 10 },
    { uid: 'b', xIn: 10, widthIn: 10 },
    { uid: 'c', xIn: 20, widthIn: 10 },
  ]
  it('finds the gap nearest the pointer', () => {
    expect(insertIndexAt(placed, 1)).toBe(0)
    expect(insertIndexAt(placed, 6)).toBe(1)
    expect(insertIndexAt(placed, 26)).toBe(3)
  })
  it('ignores the item being dragged', () => {
    expect(insertIndexAt(placed, 26, 'a')).toBe(2)
  })
})

describe('fmtIn', () => {
  it('rounds for display', () => {
    expect(fmtIn(4.4999999)).toBe('4.5')
    expect(fmtIn(12)).toBe('12')
    expect(fmtIn(-0.00001)).toBe('0')
  })
})

describe('checkPlan', () => {
  it('checks each shelf on its own and counts the ones over', () => {
    const plan = {
      shelves: [
        { id: 'bottom', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [{ uid: 'a', upc: 'jug64', facings: 13 }] }, // 52 in
        { id: 'top', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [{ uid: 'b', upc: 'ketchup20', facings: 2 }] },
      ],
    }
    const r = checkPlan(plan, dimsOf)
    expect(r.overCount).toBe(1)
    expect(r.byShelf.bottom.overIn).toBeCloseTo(4)
    expect(r.byShelf.top.remainingIn).toBeCloseTo(42.5)
    expect(r.widestIn).toBeCloseTo(52)
    expect(r.tooTall).toBe(1) // one product (13 facings of it) taller than the 12 in clearance
  })
})
