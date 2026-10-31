import { describe, it, expect } from 'vitest'
import { buildIndex, search } from './search.js'
import { candidateKeys, digits } from './upc.js'

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

/** The search as it was before: sort every hit, then take the first 60. The new one must give the same list. */
function sortEverything(index, query, limit = 60) {
  const q = (query || '').trim().toUpperCase()
  if (!q) return []
  const d = digits(q)
  const isNumber = d.length >= 4 && d.length === q.replace(/[\s-]/g, '').length
  let hits
  if (isNumber) {
    const exact = new Set(candidateKeys(d))
    hits = index.filter((e) => exact.has(e.item.upc) || String(e.item.upc).includes(d))
    hits.sort((a, b) => Number(exact.has(b.item.upc)) - Number(exact.has(a.item.upc)))
  } else {
    const words = q.split(/\s+/)
    hits = index.filter((e) => words.every((w) => e.hay.includes(w)))
    hits.sort((a, b) =>
      Number(!!a.item.specialOrder) - Number(!!b.item.specialOrder) ||
      Number(!a.hay.startsWith(words[0])) - Number(!b.hay.startsWith(words[0])) ||
      (a.item.description || '').localeCompare(b.item.description || ''))
  }
  return hits.slice(0, limit).map((e) => e.item)
}

describe('search returns the best 60 without sorting every hit', () => {
  // a made-up catalog of 3,000 products: repeated names, special orders, mixed case and accents
  const brands = ['HNZ', 'FDC', 'Frenchs', 'Gulden', 'Tide', 'Gain', 'Éclat', 'ALL', 'Downy', 'heinz']
  const things = ['KETCHUP', 'MUSTARD', 'PODS', 'SQZ', 'ORIGINAL', 'FREE CLEAR', 'SPICY BROWN', 'Liquid', 'Sheets']
  let seed = 7
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n }
  const items = Array.from({ length: 3000 }, (_, i) => ({
    upc: String(10000000000 + i * 7919).padStart(12, '0'),
    description: `${brands[rnd(brands.length)]} ${things[rnd(things.length)]}${rnd(3) ? ` ${things[rnd(things.length)]}` : ''}`,
    size: `${1 + rnd(64)} OZ`,
    classCode: '316',
    subclassCode: String(rnd(4)),
    specialOrder: rnd(6) === 0,
  }))
  const big = buildIndex({ items, subclassNames: { '316-0': 'KETCHUP', '316-1': 'MUSTARD' } })
  for (const q of ['k', 'ke', 'ketchup', 'KETCHUP HNZ', 'hnz', 'mustard spicy', 'pods tide', 'oz', 'e', 'éclat', 'free clear 20', '1000', '0000', '7919', '100000000000', 'nothing like this']) {
    it(`same order as before for “${q}”`, () => {
      expect(search(big, q).map((i) => i.upc)).toEqual(sortEverything(big, q).map((i) => i.upc))
    })
  }
  it('also for a smaller limit', () => {
    expect(search(big, 'ketchup', 5).map((i) => i.upc)).toEqual(sortEverything(big, 'ketchup', 5).map((i) => i.upc))
  })
})
