// Product photos: one per product (by UPC), saved on this phone and shown on every facing.
// Pictures are trimmed of plain white space around the product and shrunk to about 400 px.
// Each is saved twice as a picture file (Blob): the photo itself, and a small copy (about 128 px) for the
// drawing and the lists, where a product is only 11 to 30 px wide.

export const PHOTO_PACK_KIND = 'shelf-planner-photos'
const MAX_EDGE = 400
export const THUMB_EDGE = 128
/** Photos taken with this phone. Only these go into backups: store pictures come back from the photo pack files. */
export const OWN_PHOTO = 'your photo'
export const isOwnPhoto = (p) => p?.source === OWN_PHOTO

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

/** Turn a picked or downloaded image into a small saved photo: { full, thumb, w, h } (full and thumb are JPEG Blobs). */
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
  const full = await canvasBlob(c, 0.85)
  return { full, thumb: Math.max(w, h) <= THUMB_EDGE ? full : await shrinkTo(c, w, h, THUMB_EDGE), w, h }
}

const canvasBlob = (canvas, quality) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The phone could not save that picture.'))), 'image/jpeg', quality))

/** A blank canvas of w x h for drawing off screen (OffscreenCanvas where the browser has it). */
function newCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const toJpeg = (c, quality) => (c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality }) : canvasBlob(c, quality))

/** Draw a picture (image, bitmap or canvas of w x h) at most `edge` px on its longest side, as a JPEG Blob. */
async function shrinkTo(source, w, h, edge) {
  const t = thumbSize(w, h, edge)
  const c = newCanvas(t.w, t.h)
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.fillStyle = '#fff'
  g.fillRect(0, 0, t.w, t.h)
  g.drawImage(source, 0, 0, t.w, t.h)
  const blob = await toJpeg(c, 0.8)
  c.width = 0 // free the canvas memory now (phones limit it)
  c.height = 0
  return blob
}

/** Size of the small copy: the longest side at most `edge` px, never bigger than the photo. */
export function thumbSize(w, h, edge = THUMB_EDGE) {
  const s = Math.min(1, edge / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/**
 * Make the small copy of a saved photo (a Blob). `size` ({ w, h }), when known, saves work: a photo that is
 * already small is used as it is, and a bigger one is shrunk while it is opened.
 */
export async function makeThumb(blob, size = null, edge = THUMB_EDGE) {
  if (size?.w > 0 && size?.h > 0 && Math.max(size.w, size.h) <= edge) return blob
  if (typeof createImageBitmap === 'function') {
    let bmp
    if (size?.w > 0 && size?.h > 0) {
      const t = thumbSize(size.w, size.h, edge)
      bmp = await createImageBitmap(blob, { resizeWidth: t.w, resizeHeight: t.h, resizeQuality: 'high' }).catch(() => null)
    }
    bmp ||= await createImageBitmap(blob)
    try {
      if (!size && Math.max(bmp.width, bmp.height) <= edge) return blob // already small
      return await shrinkTo(bmp, size?.w || bmp.width, size?.h || bmp.height, edge)
    } finally {
      bmp.close?.()
    }
  }
  const img = await loadImage(blob)
  if (Math.max(img.width, img.height) <= edge) return blob
  return shrinkTo(img, img.width, img.height, edge)
}

/** "data:image/jpeg;base64,..." -> a Blob of the same picture. */
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '')
  if (!m) throw new Error('not a picture')
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] })
  if (typeof Uint8Array.fromBase64 === 'function') return new Blob([Uint8Array.fromBase64(m[3])], { type: m[1] })
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/** A Blob -> "data:image/jpeg;base64,..." (for backup files, which are text). */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`
}

/**
 * A photo record from a pack, a backup or the old saved form ({ data: data URL, w, h, source, addedAt })
 * -> the record saved now ({ thumb, full, w, h, source, addedAt }). `thumbOf` makes the small copy;
 * if it fails (a picture this phone cannot read), the photo itself is used for it.
 */
export async function toStoredPhoto(p, { thumbOf = makeThumb } = {}) {
  const full = dataUrlToBlob(p.data)
  let thumb
  try { thumb = await thumbOf(full, { w: p.w, h: p.h }) } catch { thumb = full }
  return { thumb, full, w: p.w, h: p.h, source: p.source || 'imported', addedAt: p.addedAt || '' }
}

/** A saved record -> the form written in backup files (the same as photo packs). */
export async function toBackupPhoto(rec) {
  return { data: await blobToDataUrl(rec.full), w: rec.w, h: rec.h, source: rec.source, addedAt: rec.addedAt }
}

/** Split a list into batches of `size` (to write a few hundred photos per transaction). */
export function batches(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
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

/**
 * Which incoming photos to save, given what is on the phone (`existing`: upc -> { addedAt, ... }, the photo
 * index is enough). Same rule as mergePhotos: never delete, a newer photo replaces an older one.
 * Returns { changes: [[upc, record]], added, replaced }.
 */
/** Should this incoming photo replace the one on the phone? Newer wins, but a photo CJ took is never replaced by a pack's. */
export function replaces(incoming, mine) {
  if (!mine) return true
  if (mine.source === 'your photo' && incoming.source !== 'your photo') return false
  return (incoming.addedAt || '') > (mine.addedAt || '')
}

export function photosToWrite(existing, incoming) {
  const changes = []
  let added = 0
  let replaced = 0
  for (const [upc, p] of Object.entries(cleanPhotos(incoming))) {
    const mine = existing[upc]
    if (!mine) { changes.push([upc, p]); added++ }
    else if (replaces(p, mine)) { changes.push([upc, p]); replaced++ }
  }
  return { changes, added, replaced }
}

/**
 * How one tile's photo is drawn: one CSS background layer per unit (facings x high), each picture fitted
 * inside its unit and standing on its bottom like the real product, plus thin lines between the units.
 * One element per tile instead of one picture per unit. Sizes in px; photoW/photoH give the picture's shape.
 */
export function tilePhotoStyle({ url, photoW, photoH, unitW, unitH, facings, high, line = 'var(--unit-line, #c6c0b5)' }) {
  const r = Math.min(unitW / (photoW || 1), unitH / (photoH || 1))
  const iw = Math.max(1, photoW * r)
  const ih = Math.max(1, photoH * r)
  const px = (n) => `${Math.round(n * 100) / 100}px`
  const images = []
  const positions = []
  for (let f = 0; f < facings; f++) {
    for (let k = 0; k < high; k++) {
      images.push(`url("${url}")`)
      positions.push(`left ${px(f * unitW + (unitW - iw) / 2)} bottom ${px(k * unitH)}`)
    }
  }
  const layers = { image: [], position: [], size: [] }
  const add = (image, position, size) => { layers.image.push(image); layers.position.push(position); layers.size.push(size) }
  // lines between facings (not after the last) and between units stacked high (not above the top one)
  if (facings > 1) add(`repeating-linear-gradient(to right, transparent 0 ${px(unitW - 1)}, ${line} ${px(unitW - 1)} ${px(unitW)})`, 'left top', `${px((facings - 1) * unitW)} 100%`)
  if (high > 1) add(`repeating-linear-gradient(to top, transparent 0 ${px(unitH - 1)}, ${line} ${px(unitH - 1)} ${px(unitH)})`, 'left bottom', `100% ${px((high - 1) * unitH)}`)
  for (let i = 0; i < images.length; i++) add(images[i], positions[i], `${px(iw)} ${px(ih)}`)
  return {
    backgroundImage: layers.image.join(', '),
    backgroundPosition: layers.position.join(', '),
    backgroundSize: layers.size.join(', '),
    backgroundRepeat: 'no-repeat',
  }
}
