import { digits, candidateKeys } from './upc.js'

/**
 * Prepare the catalog for fast searching (done once after loading).
 * Each entry also gets `rank`: its place in the usual order (regular items before KEHE special orders,
 * then by name), so a search never has to sort its hits.
 */
export function buildIndex(catalog) {
  const sub = catalog.subclassNames || {}
  const index = catalog.items.map((item, i) => ({
    item,
    i,
    hay: `${item.description} ${item.size} ${sub[`${item.classCode}-${item.subclassCode}`] || ''}`.toUpperCase(),
    rank: 0,
  }))
  const byName = new Intl.Collator().compare // the same order as localeCompare, much faster
  const order = [...index].sort((a, b) =>
    Number(!!a.item.specialOrder) - Number(!!b.item.specialOrder) ||
    byName(a.item.description || '', b.item.description || '') ||
    a.i - b.i)
  order.forEach((e, r) => { e.rank = r })
  return index
}

/** Keep the `limit` entries with the lowest keys, in order, without sorting every hit. */
function best(limit) {
  const keys = []
  const items = []
  return {
    add(key, item) {
      if (keys.length >= limit && key >= keys[keys.length - 1]) return
      let lo = 0
      let hi = keys.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < key) lo = mid + 1; else hi = mid }
      keys.splice(lo, 0, key)
      items.splice(lo, 0, item)
      if (keys.length > limit) { keys.pop(); items.pop() }
    },
    items: () => items,
  }
}

/**
 * Search by words (all must match, in any order) or by UPC digits.
 * Regular items come before KEHE special-order items; then names starting with the first word; then by name.
 * Returns the best `limit` matches.
 */
export function search(index, query, limit = 60) {
  const q = (query || '').trim().toUpperCase()
  if (!q) return []
  const d = digits(q)
  const isNumber = d.length >= 4 && d.length === q.replace(/[\s-]/g, '').length
  const n = index.length
  const top = best(limit)
  if (isNumber) {
    // exact barcode first, then the rest in catalog order
    const exact = new Set(candidateKeys(d))
    for (const e of index) {
      const isExact = exact.has(e.item.upc)
      if (isExact || String(e.item.upc).includes(d)) top.add((isExact ? 0 : n) + e.i, e.item)
    }
  } else {
    const words = q.split(/\s+/)
    for (const e of index) {
      if (!words.every((w) => e.hay.includes(w))) continue
      // rank already puts special orders last; a name starting with the first word goes first within each group
      const special = e.item.specialOrder ? 2 : 0
      const starts = e.hay.startsWith(words[0]) ? 0 : 1
      top.add((special + starts) * n + e.rank, e.item)
    }
  }
  return top.items()
}
