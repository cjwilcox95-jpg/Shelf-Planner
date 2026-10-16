// Product photos: one per product (by UPC), saved on this phone and shown on every facing.
// Pictures are trimmed of plain white space around the product and shrunk to about 400 px.

export const PHOTO_PACK_KIND = 'shelf-planner-photos'
const MAX_EDGE = 400

/**
 * Find the box around the product in an image on a plain white (or see-through) background.
 * `data` is RGBA pixels (as from canvas getImageData). Returns { x, y, w, h } or null if blank.
 */
export function contentBox(data, width, height, { threshold = 242, alphaMin = 16 } = {}) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const isBackground = data[i + 3] < alphaMin ||
        (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold)
      if (!isBackground) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Is the border of the picture mostly plain white? Then trimming is safe. */
export function hasWhiteBorder(data, width, height, threshold = 242) {
  let white = 0
  let total = 0
  const check = (x, y) => {
    const i = (y * width + x) * 4
    total++
    if (data[i + 3] < 16 || (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold)) white++
  }
  for (let x = 0; x < width; x += 2) { check(x, 0); check(x, height - 1) }
  for (let y = 0; y < height; y += 2) { check(0, y); check(width - 1, y) }
  return total > 0 && white / total > 0.9
}

/** Turn a picked or downloaded image into a small saved photo: { data, w, h }. */
export async function processPhoto(blob, { maxEdge = MAX_EDGE } = {}) {
  const img = await loadImage(blob)
  // First shrink big camera photos to a workable size.
  const first = Math.min(1, 1200 / Math.max(img.width, img.height))
  const w0 = Math.max(1, Math.round(img.width * first))
  const h0 = Math.max(1, Math.round(img.height * first))
  const c0 = document.createElement('canvas')
  c0.width = w0
  c0.height = h0
  const g0 = c0.getContext('2d', { willReadFrequently: true })
  g0.fillStyle = '#fff'
  g0.fillRect(0, 0, w0, h0)
  g0.drawImage(img, 0, 0, w0, h0)
  const pixels = g0.getImageData(0, 0, w0, h0).data
  let box = { x: 0, y: 0, w: w0, h: h0 }
  if (hasWhiteBorder(pixels, w0, h0)) {
    const b = contentBox(pixels, w0, h0)
    if (b && b.w > w0 * 0.05 && b.h > h0 * 0.05) {
      const pad = Math.round(Math.max(b.w, b.h) * 0.01)
      box = {
        x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
        w: Math.min(w0 - Math.max(0, b.x - pad), b.w + pad * 2),
        h: Math.min(h0 - Math.max(0, b.y - pad), b.h + pad * 2),
      }
    }
  }
  const scale = Math.min(1, maxEdge / Math.max(box.w, box.h))
  const w = Math.max(1, Math.round(box.w * scale))
  const h = Math.max(1, Math.round(box.h * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(c0, box.x, box.y, box.w, box.h, 0, 0, w, h)
  return { data: c.toDataURL('image/jpeg', 0.85), w, h }
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture this phone can read.')) }
    img.src = url
  })
}

/** Keep only well-formed photo records from a pack or backup. */
export function cleanPhotos(raw) {
  const out = {}
  for (const [upc, p] of Object.entries(raw || {})) {
    if (/^(\d{12}|photo-[a-z0-9_-]{1,60})$/.test(upc) && p && typeof p.data === 'string' && p.data.startsWith('data:image/') && p.w > 0 && p.h > 0) {
      out[upc] = { data: p.data, w: p.w, h: p.h, source: p.source || 'imported', addedAt: p.addedAt || '' }
    }
  }
  return out
}

/** Add photos from a pack or backup. A photo already on the phone is kept unless the incoming one is newer. */
export function mergePhotos(existing, incoming) {
  const merged = { ...existing }
  let added = 0
  let replaced = 0
  for (const [upc, p] of Object.entries(cleanPhotos(incoming))) {
    if (!merged[upc]) { merged[upc] = p; added++ }
    else if ((p.addedAt || '') > (merged[upc].addedAt || '')) { merged[upc] = p; replaced++ }
  }
  return { merged, added, replaced }
}
