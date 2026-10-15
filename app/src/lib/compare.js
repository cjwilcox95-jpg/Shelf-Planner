// What changes going from one plan to another (for example "current" -> "proposed").
// Products are matched by UPC. Shelves are matched by number, 1 = bottom.

import { fmtIn } from './fit.js'
import { positions } from './plan.js'

/** Where every product is on the shelves: upc -> { shelf, pos, facings, high, uid } (first spot; facings added up). */
function locate(plan) {
  const at = new Map()
  plan.shelves.forEach((s, k) => {
    const posOf = positions(s.items)
    for (const i of s.items) {
      if (i.kind === 'gap') continue
      const prev = at.get(i.upc)
      if (prev) { prev.facings += i.facings; prev.spots++; continue }
      at.set(i.upc, { shelf: k + 1, pos: posOf.get(i.uid), facings: i.facings, high: i.high || 1, uid: i.uid, spots: 1, item: i })
    }
  })
  return at
}

/** Positions that are NOT part of the longest run kept in the same order (those are the ones that moved). */
function movedAlong(seq) {
  const n = seq.length
  const len = Array(n).fill(1)
  const prev = Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j }
    }
  }
  let best = -1
  for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i
  const keep = new Set()
  for (let i = best; i >= 0; i = prev[i]) keep.add(i)
  return seq.map((_, i) => !keep.has(i))
}

/**
 * Compare plan `from` with plan `to`.
 * Returns lists of { upc, uid, item, before, after } plus shelf size changes.
 */
export function comparePlans(from, to) {
  const a = locate(from)
  const b = locate(to)
  const out = { added: [], removed: [], movedShelf: [], movedAlong: [], facings: [], shelves: [], same: 0 }

  for (const [upc, after] of b) {
    const before = a.get(upc)
    if (!before) { out.added.push({ upc, item: after.item, uid: after.uid, after }); continue }
    if (before.shelf !== after.shelf) out.movedShelf.push({ upc, item: after.item, uid: after.uid, before, after })
    if (before.facings !== after.facings || before.high !== after.high) out.facings.push({ upc, item: after.item, uid: after.uid, before, after })
  }
  for (const [upc, before] of a) {
    if (!b.has(upc)) out.removed.push({ upc, item: before.item, before, toTray: (to.tray || []).some((i) => i.upc === upc) })
  }

  // Order along each shelf, for products on the same shelf in both plans
  const shelves = Math.max(from.shelves.length, to.shelves.length)
  for (let n = 1; n <= shelves; n++) {
    const common = [...b.entries()]
      .filter(([upc, x]) => x.shelf === n && a.get(upc)?.shelf === n)
      .sort((x, y) => x[1].pos - y[1].pos)
    const moved = movedAlong(common.map(([upc]) => a.get(upc).pos))
    common.forEach(([upc, after], i) => {
      if (moved[i]) out.movedAlong.push({ upc, item: after.item, uid: after.uid, before: a.get(upc), after })
    })
  }
  const changed = new Set([...out.movedShelf, ...out.movedAlong, ...out.facings].map((x) => x.upc))
  out.same = [...b.keys()].filter((upc) => a.has(upc) && !changed.has(upc)).length

  // Shelf sizes
  for (let n = 1; n <= shelves; n++) {
    const s1 = from.shelves[n - 1]
    const s2 = to.shelves[n - 1]
    if (!s1 || !s2) { out.shelves.push({ shelf: n, text: s2 ? 'new shelf' : 'shelf taken out' }); continue }
    const parts = []
    for (const [k, label] of [['widthIn', 'width'], ['depthIn', 'depth'], ['clearanceIn', 'clearance']]) {
      if (s1[k] !== s2[k]) parts.push(`${label} ${fmtIn(s1[k])} → ${fmtIn(s2[k])} in`)
    }
    if (parts.length) out.shelves.push({ shelf: n, text: parts.join(', ') })
  }
  return out
}

export const changeCount = (c) =>
  c.added.length + c.removed.length + c.movedShelf.length + c.movedAlong.length + c.facings.length + c.shelves.length

const spot = (x) => `shelf ${x.shelf}, #${x.pos}`
const fac = (x) => `${x.facings} facing${x.facings > 1 ? 's' : ''}${x.high > 1 ? `, ${x.high} high` : ''}`

/** The same changes as rows for the printed change list (columns: Change, Product, Size, Before, After). */
export function changeRows(c, products) {
  const rows = []
  const group = (title, list, row) => {
    if (!list.length) return
    rows.push({ type: 'heading', text: `${title} (${list.length})`, right: '' })
    for (const x of list) rows.push({ type: 'item', check: true, cells: row(x) })
  }
  const name = (x) => products.info(x.item).description
  const size = (x) => products.info(x.item).size || ''
  group('Take out', c.removed, (x) => ['Take out', name(x), size(x), `${spot(x.before)}, ${fac(x.before)}`, x.toTray ? 'off the shelf' : 'not in plan'])
  group('Add', c.added, (x) => ['Add', name(x), size(x), 'new', `${spot(x.after)}, ${fac(x.after)}`])
  group('Move to another shelf', c.movedShelf, (x) => ['Move', name(x), size(x), spot(x.before), spot(x.after)])
  group('Move along the same shelf', c.movedAlong, (x) => ['Slide', name(x), size(x), spot(x.before), spot(x.after)])
  group('Change facings', c.facings, (x) => ['Facings', name(x), size(x), `${spot(x.after)}, ${fac(x.before)}`, fac(x.after)])
  if (c.shelves.length) {
    rows.push({ type: 'heading', text: `Shelf changes (${c.shelves.length})`, right: '' })
    for (const s of c.shelves) rows.push({ type: 'item', check: true, cells: ['Shelf', `Shelf ${s.shelf}`, '', '', s.text] })
  }
  if (!rows.length) rows.push({ type: 'note', text: 'No changes: the two plans are the same.' })
  return rows
}

export const CHANGE_COLUMNS = [
  { label: 'Change', w: 0.75 },
  { label: 'Product', w: 2.6 },
  { label: 'Size', w: 0.8 },
  { label: 'Before', w: 1.8 },
  { label: 'After', w: 1.4 },
]
