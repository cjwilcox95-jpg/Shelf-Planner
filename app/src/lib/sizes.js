// Real product sizes, replacing guesses one dimension at a time.
// Saved per product (by UPC), so a correction shows up everywhere the product is used.
//   record: { w: { v, src }, h: { v, src }, d: { v, src }, type?, note?, updatedAt }
//   src is 'measured' (tape measure) or 'photo' (estimated from a photo). Missing = still a guess.

export const SIZES_PACK_KIND = 'shelf-planner-sizes'
export const SOURCE_LABEL = {
  measured: 'measured',
  afi: 'from AFI planogram',
  afiEstimate: 'estimated from AFI shelf count',
  photo: 'from photo',
  guess: 'guess',
}

/**
 * Mark shown next to a number: ~ for a guess, ≈ for an estimate (photo, or depth worked out from AFI's
 * shelf count), nothing when measured with a tape or drawn to scale by AFI.
 */
export const sourceMark = (src) => (src === 'guess' ? '~' : src === 'photo' || src === 'afiEstimate' ? '≈' : '')
const DIMS = ['w', 'h', 'd']

/**
 * Combine a guess with whatever real sizes are known, one dimension at a time.
 * Anything you entered yourself wins (tape measure, then a photo measurement); then AFI's to-scale drawing;
 * then the depth worked out from AFI's shelf count; then a guess.
 * afi: { w, h, d } from the store data (catalog.afiSizes), or null.
 */
export function resolveDims(guess, rec, afi = null) {
  const out = { w: guess.w, h: guess.h, d: guess.d, source: { w: 'guess', h: 'guess', d: 'guess' } }
  const rank = { guess: 0, afiEstimate: 1, afi: 2, photo: 3, measured: 4 }
  const offer = (k, v, src) => {
    if (v > 0 && rank[src] > rank[out.source[k]]) { out[k] = v; out.source[k] = src }
  }
  for (const k of DIMS) {
    if (afi?.[k] > 0) offer(k, afi[k], k === 'd' ? 'afiEstimate' : 'afi')
    const x = rec?.[k]
    if (x && (x.src === 'measured' || x.src === 'photo')) offer(k, x.v, x.src)
  }
  return out
}

const okDim = (x) => x && typeof x.v === 'number' && x.v > 0 && x.v < 200 && (x.src === 'measured' || x.src === 'photo')

/** Keep only well-formed size records (from a sizes pack or backup). */
export function cleanSizes(raw) {
  const out = {}
  for (const [upc, r] of Object.entries(raw || {})) {
    // a 12-digit UPC, or the stand-in id of a product that is not in the store files ("photo-...")
    if (!/^(\d{12}|photo-[a-z0-9_-]{1,60})$/.test(upc) || !r || typeof r !== 'object') continue
    const rec = { updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '' }
    for (const k of DIMS) if (okDim(r[k])) rec[k] = { v: r[k].v, src: r[k].src, ...(r[k].note ? { note: String(r[k].note) } : {}) }
    if (typeof r.type === 'string') rec.type = r.type
    if (typeof r.note === 'string' && r.note.trim()) rec.note = r.note
    if (DIMS.some((k) => rec[k]) || rec.type || rec.note) out[upc] = rec
  }
  return out
}

/**
 * Merge incoming sizes into the phone's. A tape-measure value is never replaced by a photo
 * estimate; otherwise the newer record wins, dimension by dimension.
 */
export function mergeSizes(existing, incoming) {
  const merged = { ...existing }
  let changed = 0
  for (const [upc, inc] of Object.entries(cleanSizes(incoming))) {
    const mine = merged[upc]
    if (!mine) { merged[upc] = inc; changed++; continue }
    const next = { ...mine }
    let touched = false
    for (const k of DIMS) {
      const a = mine[k]
      const b = inc[k]
      if (!b) continue
      const keepMine = a && (a.src === 'measured' && b.src === 'photo')
      const newer = (inc.updatedAt || '') >= (mine.updatedAt || '')
      if (!a || (!keepMine && newer)) { next[k] = b; touched = true }
    }
    if (inc.type && !mine.type) { next.type = inc.type; touched = true }
    if (inc.note && !mine.note) { next.note = inc.note; touched = true }
    if (touched) { next.updatedAt = [mine.updatedAt, inc.updatedAt].sort().pop(); merged[upc] = next; changed++ }
  }
  return { merged, changed }
}

/**
 * Photo measuring: two taps on something of known length (`refIn` inches), then two taps on
 * the product. Points are in the photo's own pixels. Returns inches, or null.
 */
export function measureFromPhoto(refA, refB, refIn, a, b) {
  const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y)
  const refPx = dist(refA, refB)
  if (!(refPx > 0) || !(refIn > 0) || !a || !b) return null
  return (dist(a, b) / refPx) * refIn
}
