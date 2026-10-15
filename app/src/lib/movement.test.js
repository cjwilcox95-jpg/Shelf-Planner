import { describe, it, expect } from 'vitest'
import { cleanMovement, csvCells, parseMovementCsv, salesRows, suggestions, paceText } from './movement.js'
import { checkPlan } from './fit.js'

const KETCHUP = '013000001243' // 0-13000-00124-3
const MUSTARD = '041500000312'

describe('cleanMovement', () => {
  it('keeps only dates and units sold by 12-digit UPC', () => {
    const m = cleanMovement({
      kind: 'shelf-planner-movement', from: '2025-09-14', to: '2025-12-31', days: 109,
      items: { [KETCHUP]: { units: 40, sales: 99.5, margin: 20 }, bad: { units: 3 }, [MUSTARD]: { units: -1 } },
      salesDollars: 5000,
    })
    expect(m.items).toEqual({ [KETCHUP]: { units: 40 } })
    expect(JSON.stringify(m)).not.toMatch(/sales"|margin|5000|99\.5/)
    expect(m.days).toBe(109)
  })
})

describe('reading a sales CSV', () => {
  it('splits quoted cells', () => {
    expect(csvCells('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"'])
  })
  it('reads only the UPC and units columns, ignoring money and on-hand', () => {
    const csv = [
      'Store report,,,,,',
      'UPC,Description,Unt/Lbs,Sales $,GM%,On Hand',
      '01300000124,HNZ KETCHUP,"1,204.00",2100.00,25.1,-14',
      '04150000031,FRENCHS MUSTARD,88,150.00,30,5',
      ',TOTAL,1292,2250,,',
    ].join('\n')
    const r = parseMovementCsv(csv)
    expect(r.columns).toEqual({ upc: 'UPC', units: 'Unt/Lbs' })
    expect(r.items).toEqual({ [KETCHUP]: { units: 1204 }, [MUSTARD]: { units: 88 } })
    expect(r.skipped).toBe(1)
  })
  it('will not use a money column as units', () => {
    expect(parseMovementCsv('UPC,Sales $,Avg Price\n01300000124,10,2').problem).toMatch(/units-sold column/)
  })
  it('needs a UPC column', () => {
    expect(parseMovementCsv('Item,Units\n1,2').problem).toMatch(/UPC/)
  })
})

// One 48 in shelf: ketchup 2 facings (3 in wide, 3 in deep -> 8 deep = 16 on shelf, pack 12),
// mustard 3 facings (2 in wide, 2 in deep -> 12 deep = 36 on shelf), relish not in the sales file.
const dims = { [KETCHUP]: { w: 3, h: 8, d: 3 }, [MUSTARD]: { w: 2, h: 7, d: 2 }, relish: { w: 3, h: 6, d: 3 } }
const products = {
  info: (i) => ({ description: i.upc, size: '', pack: i.upc === KETCHUP ? '24' : '12' }),
  dims: (i) => ({ ...dims[i.upc], source: { w: 'guess', h: 'guess', d: 'guess' } }),
}
const plan = {
  shelves: [{ id: 's1', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [
    { uid: 'k', upc: KETCHUP, facings: 2 }, { uid: 'm', upc: MUSTARD, facings: 3 }, { uid: 'r', upc: 'relish', facings: 1 },
  ] }],
  tray: [],
}
const check = checkPlan(plan, (i) => products.dims(i))
// 70 days = 10 weeks
const movement = cleanMovement({ days: 70, items: { [KETCHUP]: { units: 300 }, [MUSTARD]: { units: 20 } } })

describe('salesRows', () => {
  const rows = salesRows(plan, check, products, movement)
  const k = rows.find((r) => r.upc === KETCHUP)
  const m = rows.find((r) => r.upc === MUSTARD)
  it('works out sales per week and per foot of shelf', () => {
    expect(k.perWeek).toBeCloseTo(30)
    expect(k.perWeekPerFoot).toBeCloseTo(30 / (6 / 12)) // 6 in of shelf
    expect(m.perWeek).toBeCloseTo(2)
  })
  it('works out how many days the shelf holds', () => {
    expect(k.capacity).toBe(16)
    expect(k.daysOfSupply).toBeCloseTo(16 / (30 / 7)) // about 3.7 days
    expect(m.daysOfSupply).toBeCloseTo(36 / (2 / 7)) // 126 days
  })
  it('marks products missing from the sales file', () => {
    expect(rows.find((r) => r.upc === 'relish').inFile).toBe(false)
  })
  it('describes the pace in plain words', () => {
    expect(paceText(k)).toBe('sells ~30/wk · shelf holds ~4 days')
    expect(paceText(m)).toBe('sells ~2/wk · shelf holds ~18 wk')
  })
})

describe('suggestions', () => {
  const rows = salesRows(plan, check, products, movement)
  const s = suggestions(plan, check, rows, { deliveryDays: 7 })
  it('flags a fast seller that may run out between deliveries', () => {
    expect(s.runOut.map((r) => r.upc)).toEqual([KETCHUP])
  })
  it('flags a product whose full case does not fit on the shelf', () => {
    // ketchup: 16 on the shelf, case of 24; relish: 8 on the shelf, case of 12
    expect(s.caseWontFit.map((r) => r.upc).sort()).toEqual([KETCHUP, 'relish'])
  })
  it('suggests a facing to give up only when the shelf would still hold plenty', () => {
    expect(s.extraFacing.map((r) => r.upc)).toEqual([MUSTARD])
  })
  it('lists slowest per foot first and not-in-file separately', () => {
    expect(s.slowest[0].upc).toBe(MUSTARD)
    expect(s.notInFile.map((r) => r.upc)).toEqual(['relish'])
  })
  it('for a shelf that is over, picks facings to give up until it fits', () => {
    const tight = { ...plan, shelves: [{ ...plan.shelves[0], widthIn: 14 }] } // uses 6 + 6 + 3 = 15 in: 1 in over
    const c = checkPlan(tight, (i) => products.dims(i))
    const sq = suggestions(tight, c, salesRows(tight, c, products, movement)).squeeze
    expect(sq).toHaveLength(1)
    expect(sq[0].picks.map((r) => r.upc)).toEqual([MUSTARD]) // ketchup is too fast to cut
    expect(sq[0].enough).toBe(true)
    expect(sq[0].freed).toBe(2)
  })
})
