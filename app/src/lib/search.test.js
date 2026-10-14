import { describe, it, expect } from 'vitest'
import { buildIndex, search } from './search.js'

const catalog = {
  subclassNames: { '316-010': 'KETCHUP' },
  items: [
    { upc: '013000001212', description: 'HNZ KETCHUP PLASTIC', size: '64 OZ', classCode: '316', subclassCode: '010' },
    { upc: '036800037480', description: 'FDC KETCHUP SQZ', size: '64 OZ', classCode: '316', subclassCode: '010' },
    { upc: '099999999993', description: 'ORGANIC KETCHUP', size: '20 OZ', classCode: '389', subclassCode: '1', specialOrder: true },
    { upc: '041500000312', description: 'FRENCHS MUSTARD SQUEEZE', size: '20 OZ', classCode: '316', subclassCode: '020' },
  ],
}
const idx = buildIndex(catalog)

describe('search', () => {
  it('needs every word, in any order', () => {
    expect(search(idx, 'ketchup hnz').map((i) => i.upc)).toEqual(['013000001212'])
  })
  it('lists special-order items last', () => {
    const r = search(idx, 'ketchup')
    expect(r[r.length - 1].specialOrder).toBe(true)
  })
  it('finds by full scanned barcode, AFI short UPC, or part of a UPC', () => {
    expect(search(idx, '013000001212')[0].upc).toBe('013000001212')
    expect(search(idx, '1300000121')[0].upc).toBe('013000001212')
    expect(search(idx, '0-13000-00121')[0].upc).toBe('013000001212')
    expect(search(idx, '36800').map((i) => i.upc)).toEqual(['036800037480'])
  })
  it('matches subclass names too', () => {
    expect(search(idx, 'ketchup 64').length).toBe(2)
  })
  it('returns nothing for an empty query', () => expect(search(idx, '  ')).toEqual([]))
})
