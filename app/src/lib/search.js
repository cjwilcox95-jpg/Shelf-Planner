import { digits, candidateKeys } from './upc.js'

/** Prepare the catalog for fast searching (done once after loading). */
export function buildIndex(catalog) {
  const sub = catalog.subclassNames || {}
  return catalog.items.map((item) => ({
    item,
    hay: `${item.description} ${item.size} ${sub[`${item.classCode}-${item.subclassCode}`] || ''}`.toUpperCase(),
  }))
}

/**
 * Search by words (all must match, in any order) or by UPC digits.
 * Regular items come before KEHE special-order items.
 */
export function search(index, query, limit = 60) {
  const q = (query || '').trim().toUpperCase()
  if (!q) return []
  const d = digits(q)
  const isNumber = d.length >= 4 && d.length === q.replace(/[\s-]/g, '').length
  let hits
  if (isNumber) {
    const exact = new Set(candidateKeys(d))
    hits = index.filter((e) => exact.has(e.item.upc) || e.item.upc.includes(d))
    hits.sort((a, b) => Number(exact.has(b.item.upc)) - Number(exact.has(a.item.upc)))
  } else {
    const words = q.split(/\s+/)
    hits = index.filter((e) => words.every((w) => e.hay.includes(w)))
    hits.sort((a, b) =>
      Number(!!a.item.specialOrder) - Number(!!b.item.specialOrder) ||
      Number(!a.hay.startsWith(words[0])) - Number(!b.hay.startsWith(words[0])) ||
      a.item.description.localeCompare(b.item.description))
  }
  return hits.slice(0, limit).map((e) => e.item)
}
