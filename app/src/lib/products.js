import { guessDims, withEdits } from './guess.js'
import { resolveDims } from './sizes.js'

// Muted colors for the stripe at the top of each placeholder tile, picked by brand
// (first word of the name), so neighbors are easy to tell apart.
const BRAND_COLORS = ['#b3412e', '#c98a1b', '#3f7d3a', '#2f6f9f', '#7a4f9a', '#9c5a2e', '#2d7f7a', '#8a3c5c']

function hash(s) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/**
 * Look up products and their dimensions: real sizes where known (`sizes`, by UPC),
 * otherwise a guess from the (possibly edited) default-guess table.
 */
export function makeProducts(catalog, { sizes = {}, guessEdits = {} } = {}) {
  const types = withEdits(guessEdits)
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
      className: p ? catalog?.classNames?.[p.classCode] || '' : '',
      inCatalog: !!p,
      specialOrder: !!p?.specialOrder,
      color: BRAND_COLORS[hash(description.split(' ')[0] || '') % BRAND_COLORS.length],
    }
  }

  function dims(item) {
    if (dimsCache.has(item.upc)) return dimsCache.get(item.upc)
    const i = info(item)
    const rec = sizes[item.upc]
    const g = guessDims({ text: `${i.description} ${i.subclass}`, scope: `${i.className} ${i.subclass}`, sizeValue: i.sizeValue, uom: i.uom, size: i.size },
      { types, typeId: rec?.type })
    const d = { ...resolveDims(g, rec), guess: { w: g.w, h: g.h, d: g.d }, type: g.type, basis: g.basis, note: rec?.note || '' }
    dimsCache.set(item.upc, d)
    return d
  }

  const isGuess = (d) => Object.values(d.source).some((s) => s === 'guess')

  return { byUpc, info, dims, isGuess, types }
}
