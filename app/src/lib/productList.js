// A product list from a spreadsheet saved as CSV, for a store that has no catalog.json.
// Only these columns are read: UPC, the product's name, and (when the file has them) size, case pack and
// category. Every other column, such as cost, price, retail or margin, is never looked at, never saved and
// never shown.

import { csvCells } from './movement.js'
import { candidateKeys } from './upc.js'
import { parseSize } from './guess.js'

const UPC_HEAD = /(^|\b)(upc|barcode|bar ?code|gtin|scan ?code)(\b|$)/i
const NAME_HEAD = /^(description|desc|item ?description|product ?(name|description)?|name|item ?name|item)$/i
const SIZE_HEAD = /^(size|item ?size|unit ?size)$/i
const PACK_HEAD = /^(pack|case ?pack|case ?qty|case ?quantity|units? ?per ?case)$/i
const GROUP_HEAD = /^(category|department|dept|class|sub ?class|sub ?category|group)$/i
const MAX_ITEMS = 100000

const find = (head, re) => head.findIndex((c) => re.test(c))

/**
 * Read a product list. Returns { catalog, columns, skipped } or { problem }.
 * `today` (YYYY-MM-DD) is written into the catalog as the day it was made.
 */
export function parseProductCsv(text, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  // the heading row: the first of the top 15 lines that names both a UPC column and a name column
  let headAt = -1
  let sawUpc = false
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const cells = csvCells(lines[i])
    const hasUpc = find(cells, UPC_HEAD) >= 0
    sawUpc ||= hasUpc
    if (hasUpc && find(cells, NAME_HEAD) >= 0) { headAt = i; break }
  }
  if (headAt < 0) {
    return { problem: sawUpc
      ? 'Could not find a column named Description or Name in that file.'
      : 'Could not find a column named UPC or Barcode in that file. The first row must name the columns.' }
  }
  const head = csvCells(lines[headAt])
  const col = { upc: find(head, UPC_HEAD), name: find(head, NAME_HEAD), size: find(head, SIZE_HEAD), pack: find(head, PACK_HEAD), group: find(head, GROUP_HEAD) }
  const items = []
  const seen = new Set()
  const groups = new Map() // category name -> code
  let skipped = 0
  for (const line of lines.slice(headAt + 1)) {
    const cells = csvCells(line)
    const upc = candidateKeys(cells[col.upc] || '')[0]
    const description = String(cells[col.name] || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!upc || !description || seen.has(upc) || items.length >= MAX_ITEMS) { skipped++; continue }
    seen.add(upc)
    const item = { upc, description: description.toUpperCase(), source: 'csv', classCode: 'csv', subclassCode: '0' }
    const size = col.size >= 0 ? String(cells[col.size] || '').trim().slice(0, 20) : ''
    if (size) {
      item.size = size.toUpperCase()
      const { value, uom } = parseSize(size)
      if (value > 0 && uom) { item.sizeValue = value; item.uom = uom }
    }
    const pack = col.pack >= 0 ? Number(String(cells[col.pack] || '').replace(/[^\d.]/g, '')) : NaN
    if (pack >= 1 && pack <= 9999) item.pack = Math.round(pack)
    const group = col.group >= 0 ? String(cells[col.group] || '').replace(/\s+/g, ' ').trim().slice(0, 40) : ''
    if (group) {
      if (!groups.has(group.toUpperCase())) groups.set(group.toUpperCase(), { code: String(groups.size + 1), name: group })
      item.subclassCode = groups.get(group.toUpperCase()).code
    }
    items.push(item)
  }
  if (!items.length) return { problem: 'No products could be read from that file: each line needs a UPC and a name.' }
  const subclassNames = Object.fromEntries([...groups.values()].map((g) => [`csv-${g.code}`, g.name]))
  return {
    catalog: {
      kind: 'shelf-planner-catalog', version: 'csv', built: today, sources: ['product list (CSV)'],
      classNames: { csv: 'Products' }, subclassNames, items, resets: [], afiSizes: {},
    },
    columns: Object.fromEntries(Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => [k, head[i]])),
    skipped,
  }
}
