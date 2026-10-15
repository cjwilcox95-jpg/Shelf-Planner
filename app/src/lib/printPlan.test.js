import { describe, it, expect } from 'vitest'
import { drawingLayout, paginate, listRows, printFileName, PORTRAIT, LANDSCAPE } from './printPlan.js'
import { checkPlan } from './fit.js'

const dims = { a: { w: 3, h: 8, d: 3 }, b: { w: 4, h: 10, d: 3 } }
const products = {
  info: (i) => (i.kind === 'gap'
    ? { gap: true, description: 'Empty space', inCatalog: true }
    : { upc: '036800083004', description: `Product ${i.upc}`, size: '20 OZ', inCatalog: i.upc !== 'b', specialOrder: false }),
  dims: (i) => ({ ...(i.kind === 'gap' ? { w: i.widthIn, h: 0, d: 0 } : dims[i.upc]), source: { w: 'guess', h: 'guess', d: 'guess' } }),
  isGuess: () => true,
}
const shelf = (id, items, over = {}) => ({ id, widthIn: 48, depthIn: 24, clearanceIn: 12, items, ...over })
const dimsOf = (i) => products.dims(i)

describe('drawingLayout', () => {
  it('a tall 4 ft section prints portrait', () => {
    const plan = { shelves: Array.from({ length: 6 }, (_, k) => shelf(`s${k}`, [])) }
    expect(drawingLayout(plan, checkPlan(plan, dimsOf)).page).toBe(PORTRAIT)
  })
  it('a wide, low 8 ft section prints landscape', () => {
    const plan = { shelves: [shelf('s0', [], { widthIn: 96 }), shelf('s1', [], { widthIn: 96 })] }
    expect(drawingLayout(plan, checkPlan(plan, dimsOf)).page).toBe(LANDSCAPE)
  })
  it('the section fits on the page', () => {
    const plan = { shelves: Array.from({ length: 7 }, (_, k) => shelf(`s${k}`, [{ uid: `x${k}`, upc: 'b', facings: 13 }])) } // 52 in, over
    const check = checkPlan(plan, dimsOf)
    const { page, s } = drawingLayout(plan, check)
    expect((check.widestIn + 1) * s).toBeLessThanOrEqual(page.w - 0.8 - 1.1 + 1e-9)
    expect(7 * (12 + 1.25) * s).toBeLessThan(page.h)
  })
})

describe('paginate', () => {
  const rows = (pattern) => [...pattern].map((c, i) => ({ type: c === 'H' ? 'heading' : 'item', i }))
  it('splits into pages of at most n rows', () => {
    const pages = paginate(rows('HIIIIIIIII'), 4)
    expect(pages.map((p) => p.length)).toEqual([4, 4, 2])
  })
  it('never leaves a heading alone at the bottom of a page', () => {
    const pages = paginate(rows('HIIHII'), 4)
    expect(pages[0].map((r) => r.type)).toEqual(['heading', 'item', 'item'])
    expect(pages[1][0].type).toBe('heading')
  })
})

describe('listRows', () => {
  const plan = {
    shelves: [
      shelf('bottom', [{ uid: '1', upc: 'a', facings: 2 }]),
      shelf('top', [{ uid: 'g', kind: 'gap', widthIn: 3 }, { uid: '2', upc: 'b', facings: 1, high: 2 }, { uid: '3', upc: 'a', facings: 1 }]),
    ],
    tray: [{ uid: '4', upc: 'a', facings: 1 }],
  }
  const rows = listRows(plan, checkPlan(plan, dimsOf), products)
  it('goes top shelf first, with headings, empty spaces as notes, and the tray last', () => {
    expect(rows.map((r) => r.type)).toEqual(['heading', 'note', 'item', 'item', 'heading', 'item', 'heading', 'item'])
    expect(rows[0].text).toBe('Shelf 2 (top)')
    expect(rows[1].text).toBe('Empty space, 3 in')
    expect(rows[6].text).toMatch(/Off the shelf/)
  })
  it('numbers products only, and shows widths and notes', () => {
    expect(rows[2].cells[0]).toBe('1') // the gap gets no number
    expect(rows[3].cells[0]).toBe('2')
    expect(rows[2].cells[5]).toBe('~4')
    expect(rows[2].cells[6]).toBe('2 high, too tall, not in store files') // 2 x 10 in > 12 in clearance
    expect(rows[2].cells[3]).toBe('') // no UPC shown for a product not in the store files
    expect(rows[7].cells[0]).toBe('–')
  })
  it('never prints a cost, price or margin column', () => {
    const header = ['#', 'Product', 'Size', 'UPC', 'Facings', 'Width in', 'Notes']
    expect(rows.filter((r) => r.cells).every((r) => r.cells.length === header.length)).toBe(true)
  })
})

describe('printFileName', () => {
  it('makes a safe file name from the plan name', () => {
    expect(printFileName({ name: 'Laundry A: Tide (from photo 2)' }, 'pdf', new Date('2026-10-15T12:00:00Z')))
      .toBe('laundry-a-tide-from-photo-2-2026-10-15.pdf')
  })
})
