import { describe, expect, it } from 'vitest'
import { parseProductCsv } from './productList.js'
import { cleanCatalog } from './clean.js'
import { identifyFile } from './backup.js'
import { buildIndex, search } from './search.js'
import { checkDigit } from './upc.js'

const MAYO = `41003710013${checkDigit('41003710013')}` // a full 12-digit barcode

const csv = [
  'Store 12 item list,,,,,,',
  'UPC,Description,Size,Case Pack,Category,Cost,Retail',
  '4-10000-10000,Sunnyvale Ketchup,20 oz,12,Condiments,1.11,2.99',
  `${MAYO},"Mayo, Real",30 OZ,6,Condiments,2.22,4.99`,
  '41007410026,Dill Spears,24 oz,,Pickles,0.99,1.99',
  ',No barcode,1 ct,1,Misc,1,2',
  '4-10000-10000,Sunnyvale Ketchup again,20 oz,12,Condiments,1.11,2.99',
].join('\r\n')

describe('a product list from a spreadsheet (CSV)', () => {
  const r = parseProductCsv(csv, { today: '2026-11-16' })
  it('finds the heading row and reads UPC, name, size, pack and category', () => {
    expect(r.problem).toBeUndefined()
    expect(r.columns).toEqual({ upc: 'UPC', name: 'Description', size: 'Size', pack: 'Case Pack', group: 'Category' })
    expect(r.catalog.items).toHaveLength(3)
    expect(r.catalog.items[0]).toMatchObject({ upc: '410000100004', description: 'SUNNYVALE KETCHUP', size: '20 OZ', sizeValue: 20, uom: 'OZ', pack: 12 })
    expect(r.catalog.items[1]).toMatchObject({ upc: MAYO, description: 'MAYO, REAL', pack: 6 })
    expect(r.catalog.items[2].pack).toBeUndefined()
    expect(r.catalog.subclassNames).toEqual({ 'csv-1': 'Condiments', 'csv-2': 'Pickles' })
    expect(r.skipped).toBe(2) // no barcode; the same barcode twice
  })
  it('never reads cost, retail or any other column', () => {
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/1\.11|2\.99|4\.99|0\.99|Cost|Retail/i)
  })
  it('makes a store-data file the app accepts, and its products can be searched', () => {
    expect(identifyFile(r.catalog).type).toBe('catalog')
    const cat = cleanCatalog(r.catalog)
    expect(cat.items).toHaveLength(3)
    expect(cat.built).toBe('2026-11-16')
    expect(search(buildIndex(cat), 'pickles').map((i) => i.description)).toEqual(['DILL SPEARS']) // by category name
  })
  it('says plainly what is missing', () => {
    expect(parseProductCsv('Name,Size\nKetchup,20 oz').problem).toMatch(/UPC or Barcode/)
    expect(parseProductCsv('UPC,Units\n410000100004,5').problem).toMatch(/Description or Name/)
    expect(parseProductCsv('UPC,Name\nabc,\n').problem).toMatch(/No products could be read/)
    expect(parseProductCsv('').problem).toBeTruthy()
  })
  it('accepts other common headings and UPCs written without the check digit', () => {
    const r2 = parseProductCsv('Barcode,Item Name,Dept\n01300000121,Ketchup Jug,Grocery\n')
    expect(r2.catalog.items).toEqual([{ upc: '013000001212', description: 'KETCHUP JUG', source: 'csv', classCode: 'csv', subclassCode: '1' }])
  })
})
