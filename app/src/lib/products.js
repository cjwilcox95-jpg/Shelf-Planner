import { guessDims } from './guess.js'

// Muted colors for the stripe at the top of each placeholder tile, picked by brand
// (first word of the name), so neighbors are easy to tell apart.
const BRAND_COLORS = ['#b3412e', '#c98a1b', '#3f7d3a', '#2f6f9f', '#7a4f9a', '#9c5a2e', '#2d7f7a', '#8a3c5c']

function hash(s) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/** Look up products and their (guessed) dimensions. */
export function makeProducts(catalog) {
  const byUpc = new Map((catalog?.items || []).map((i) => [i.upc, i]))
  const sub = catalog?.subclassNames || {}
  const dimsCache = new Map()

  function info(item) {
    const p = byUpc.get(item.upc)
    const description = p?.description ?? item.description ?? item.upc
    return {
      upc: item.upc,
      description,
      size: p?.size ?? item.size ?? '',
      sizeValue: p?.sizeValue,
      uom: p?.uom,
      pack: p?.pack,
      aisle: p?.aisle,
      subclass: p ? sub[`${p.classCode}-${p.subclassCode}`] || '' : '',
      inCatalog: !!p,
      specialOrder: !!p?.specialOrder,
      color: BRAND_COLORS[hash(description.split(' ')[0] || '') % BRAND_COLORS.length],
    }
  }

  function dims(item) {
    if (dimsCache.has(item.upc)) return dimsCache.get(item.upc)
    const i = info(item)
    const g = guessDims({ text: `${i.description} ${i.subclass}`, sizeValue: i.sizeValue, uom: i.uom, size: i.size })
    const d = { w: g.w, h: g.h, d: g.d, source: { w: 'guess', h: 'guess', d: 'guess' }, basis: g.basis }
    dimsCache.set(item.upc, d)
    return d
  }

  const isGuess = (d) => Object.values(d.source).some((s) => s === 'guess')

  return { byUpc, info, dims, isGuess }
}
