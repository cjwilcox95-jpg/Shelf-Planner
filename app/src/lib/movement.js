// Sales help: how fast each product sells compared with the room it gets.
// Uses UNITS SOLD only. Sales dollars, cost, margin and on-hand are never read or stored
// (on-hand for grocery is a book number, not a count; money is the employer's business data).
// Everything here is a suggestion ("worth a look"); nothing changes a plan.

import { candidateKeys } from './upc.js'
import { positions, shelfLabel } from './plan.js'

export const MOVEMENT_KIND = 'shelf-planner-movement'

/** Keep only what the app uses: dates and units sold by 12-digit UPC. */
export function cleanMovement(doc) {
  const items = {}
  for (const [upc, rec] of Object.entries(doc?.items || {})) {
    const units = Number(rec?.units)
    if (!/^\d{12}$/.test(upc) || !Number.isFinite(units) || units < 0) continue
    items[upc] = { units, ...(typeof rec.check === 'string' ? { check: rec.check.slice(0, 80) } : {}) }
  }
  const from = /^\d{4}-\d\d-\d\d$/.test(doc?.from) ? doc.from : null
  const to = /^\d{4}-\d\d-\d\d$/.test(doc?.to) ? doc.to : null
  let days = Number(doc?.days)
  if (!(days > 0) && from && to) days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1 // both ends count
  return {
    kind: MOVEMENT_KIND,
    version: 1,
    source: String(doc?.source || 'sales file').slice(0, 120),
    from,
    to,
    days: days > 0 && days < 2000 ? Math.round(days) : null,
    selectedOnly: !!doc?.selectedOnly,
    loadedAt: doc?.loadedAt || new Date().toISOString(),
    items,
  }
}

/** Split one CSV line, with "quoted, fields". */
export function csvCells(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const MONEY_OR_STOCK = /\$|cost|price|retail|margin|gm|profit|on.?hand|\boh\b|avg|average|sales\s*\$|amount|dollar|coupon|cpn/i
const UNITS_HEAD = /^(units?(\s*sold)?|unit\s*sales|qty(\s*sold)?|quantity(\s*sold)?|unt\/?lbs|units?\/lbs|movement|sold|mvmt)$/i

/**
 * Read a sales export (CSV). Only a UPC column and a units column are read; every other column is ignored.
 * knownUpc(upc12) -> true when the product is in the store data (used to pick the right reading of short UPCs).
 */
export function parseMovementCsv(text, knownUpc = () => true) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const headAt = lines.findIndex((l) => csvCells(l).some((c) => /\bupc\b/i.test(c)))
  if (headAt < 0) return { problem: 'Could not find a column named UPC in that file.' }
  const head = csvCells(lines[headAt])
  const upcCol = head.findIndex((c) => /\bupc\b/i.test(c))
  const unitCols = head.map((c, i) => (UNITS_HEAD.test(c) && !MONEY_OR_STOCK.test(c) ? i : -1)).filter((i) => i >= 0)
  if (!unitCols.length) return { problem: 'Could not find a units-sold column (named Units, Qty, Unt/Lbs or Movement).' }
  const unitCol = unitCols[0]
  const items = {}
  let skipped = 0
  for (const line of lines.slice(headAt + 1)) {
    const cells = csvCells(line)
    const units = Number(String(cells[unitCol] || '').replace(/[,\s]/g, ''))
    const keys = candidateKeys(cells[upcCol] || '')
    const upc = keys.find(knownUpc) || null
    if (!upc || !Number.isFinite(units) || units < 0) { skipped++; continue }
    items[upc] = { units: (items[upc]?.units || 0) + units }
  }
  return { items, columns: { upc: head[upcCol], units: head[unitCol] }, skipped }
}

const r1 = (x) => Math.round(x * 10) / 10

/**
 * Every product on the plan's shelves with its sales pace and how long the shelf lasts.
 * check = checkPlan(plan); movement = cleanMovement(...); returns rows (one per UPC, placements added up).
 */
export function salesRows(plan, check, products, movement) {
  const weeks = movement?.days ? movement.days / 7 : null
  const byUpc = new Map()
  plan.shelves.forEach((s, k) => {
    const posOf = positions(s.items)
    s.items.forEach((item, i) => {
      if (item.kind === 'gap') return
      const p = check.byShelf[s.id].items[i]
      const row = byUpc.get(item.upc)
      if (row) {
        row.facings += item.facings
        row.inches += p.widthIn
        row.capacity += p.capacity
        row.spots++
        return
      }
      const info = products.info(item)
      const sold = movement?.items?.[item.upc]
      byUpc.set(item.upc, {
        uid: item.uid, upc: item.upc, name: info.description, size: info.size, pack: Number(info.pack) || null,
        shelf: shelfLabel(plan, s.id), shelfId: s.id, pos: posOf.get(item.uid),
        facings: item.facings, inches: p.widthIn, capacity: p.capacity, spots: 1,
        depthGuess: products.dims(item).source.d === 'guess',
        inFile: !!sold,
        units: sold ? sold.units : null,
        check: sold?.check || null,
      })
    })
  })
  const rows = [...byUpc.values()]
  for (const r of rows) {
    r.perWeek = r.units != null && weeks ? r.units / weeks : null
    r.perWeekPerFoot = r.perWeek != null && r.inches > 0 ? r.perWeek / (r.inches / 12) : null
    r.daysOfSupply = r.perWeek > 0 && r.capacity > 0 ? r.capacity / (r.perWeek / 7) : null
  }
  return rows
}

/**
 * Suggestions, each a list of rows with a reason. deliveryDays = days between deliveries.
 * Nothing here changes the plan.
 */
export function suggestions(plan, check, rows, { deliveryDays = 7 } = {}) {
  const sold = rows.filter((r) => r.perWeek != null)
  const safeDays = deliveryDays * 1.5
  const out = {}
  out.runOut = sold.filter((r) => r.daysOfSupply != null && r.daysOfSupply < safeDays)
    .sort((a, b) => a.daysOfSupply - b.daysOfSupply)
  out.caseWontFit = rows.filter((r) => r.pack && r.capacity > 0 && r.capacity < r.pack)
    .sort((a, b) => a.capacity / a.pack - b.capacity / b.pack)
  out.slowest = sold.filter((r) => r.perWeekPerFoot != null).sort((a, b) => a.perWeekPerFoot - b.perWeekPerFoot).slice(0, 10)
  out.best = [...sold].sort((a, b) => b.perWeek - a.perWeek).slice(0, 10)
  out.extraFacing = sold.filter((r) => r.facings > 1 && r.daysOfSupply != null &&
    r.daysOfSupply * ((r.facings - 1) / r.facings) >= Math.max(60, safeDays))
    .sort((a, b) => b.daysOfSupply - a.daysOfSupply)
  out.noSales = sold.filter((r) => r.units === 0)
  out.notInFile = rows.filter((r) => !r.inFile)
  // Shelves over: which facings to give up first (the most days on the shelf, still safe after)
  out.squeeze = []
  plan.shelves.forEach((s, k) => {
    const fit = check.byShelf[s.id]
    if (!fit.isOver) return
    // One candidate per spot on THIS shelf (a product can sit on two shelves): give up one facing here,
    // and the product must still last long enough counting all its spots.
    const byUpc = new Map(sold.map((r) => [r.upc, r]))
    const cands = []
    s.items.forEach((item, i) => {
      const r = byUpc.get(item.upc)
      const p = fit.items[i]
      if (!r || p.gap || item.facings < 2 || !(r.perWeek > 0)) return
      const capAfter = r.capacity - p.capacity / item.facings
      const daysAfter = capAfter / (r.perWeek / 7)
      if (daysAfter >= safeDays) cands.push({ ...r, uid: item.uid, pos: positions(s.items).get(item.uid), facings: item.facings, unitWidth: p.unitWidthIn, daysAfter })
    })
    cands.sort((a, b) => b.daysAfter - a.daysAfter)
    const picks = []
    let freed = 0
    for (const c of cands) {
      if (freed >= fit.overIn - 1e-6) break
      picks.push(c)
      freed += c.unitWidth
    }
    out.squeeze.push({ shelf: shelfLabel(plan, s.id), shelfId: s.id, overIn: fit.overIn, picks, freed: r1(freed), enough: freed >= fit.overIn - 1e-6 })
  })
  return out
}

/** "sells about 12 a week · shelf holds about 3 weeks" */
export function paceText(r) {
  if (!r) return ''
  if (r.units == null) return 'not in the sales file'
  if (r.perWeek == null) return `${r.units} sold (dates of the file unknown)`
  if (r.perWeek === 0) return 'no sales in the period'
  const pw = r.perWeek >= 10 ? Math.round(r.perWeek) : r1(r.perWeek)
  const holds = r.daysOfSupply == null ? '' : r.daysOfSupply >= 14
    ? ` · shelf holds ~${Math.round(r.daysOfSupply / 7)} wk`
    : ` · shelf holds ~${Math.max(1, Math.round(r.daysOfSupply))} days`
  return `sells ~${pw}/wk${holds}`
}
