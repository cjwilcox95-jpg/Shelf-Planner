// Everything is saved on this device, in the browser's IndexedDB. Nothing is sent anywhere.
//
// Stores:
//  - kv: plans, store data, sizes, settings... one value per key.
//  - photos: one record per product photo, by UPC: { thumb: Blob (about 128 px), full: Blob (as imported,
//    at most 400 px), w, h, source, addedAt }. Pictures are kept as files (Blobs), not text, and only the
//    ones on screen are read.
//  - photoInfo: the same records without the pictures ({ w, h, source, addedAt }), so the app can know which
//    products have a photo at startup without reading 15,000 pictures.
// Version 1 kept photos in kv under "photo:<upc>" as text; they are moved over at startup (see photoMove.js).

import { replaces } from './photos.js'

const DB_NAME = 'shelf-planner'
const DB_VERSION = 2
const STORE = 'kv'
export const PHOTOS = 'photos'
export const PHOTO_INFO = 'photoInfo'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
      if (!d.objectStoreNames.contains(PHOTOS)) d.createObjectStore(PHOTOS)
      if (!d.objectStoreNames.contains(PHOTO_INFO)) d.createObjectStore(PHOTO_INFO)
    }
    req.onsuccess = () => {
      // another tab opened a newer version: let it, and open again next time
      req.result.onversionchange = () => { req.result.close(); dbPromise = null }
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => console.warn('Shelf Planner is open in another tab; close it to finish updating.')
  })
}

let dbPromise
const db = () => (dbPromise ||= open())

/** Run a transaction; resolves with what `fn` returns once everything is really written. */
async function run(stores, mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode)
    let out
    try { out = fn(tx) } catch (e) { tx.abort(); reject(e); return }
    tx.oncomplete = () => resolve(typeof out === 'function' ? out() : out)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Saving was stopped'))
  })
}

export async function load(key) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function save(key, value) {
  return run(STORE, 'readwrite', (tx) => { tx.objectStore(STORE).put(value, key) })
}

/** Ask the browser not to clear our data when space runs low. Not every browser agrees. */
export async function askToKeepData() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist()
    }
    return navigator.storage?.persisted ? await navigator.storage.persisted() : false
  } catch {
    return false
  }
}

/** How much space this app uses on the phone, in bytes (null where the browser cannot tell). */
export async function spaceUsed() {
  try {
    return navigator.storage?.estimate ? (await navigator.storage.estimate()).usage ?? null : null
  } catch {
    return null
  }
}

/** Check a picked file really is a Shelf Planner store-data file before saving it. */
export function validateCatalog(doc) {
  if (!doc || doc.kind !== 'shelf-planner-catalog') return 'This is not a Shelf Planner store-data file.'
  if (!Array.isArray(doc.items) || !doc.items.length) return 'The file has no products in it.'
  return null
}

const prefixRange = (prefix) => IDBKeyRange.bound(prefix, `${prefix}￿`)

/** Everything saved under keys that start with `prefix` (for example every "size:..."). */
export async function loadPrefix(prefix) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const out = {}
    const req = d.transaction(STORE).objectStore(STORE).openCursor(prefixRange(prefix))
    req.onsuccess = () => {
      const c = req.result
      if (c) { out[c.key] = c.value; c.continue() } else resolve(out)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Only the keys that start with `prefix` (no values read). */
export async function keysWithPrefix(prefix) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).getAllKeys(prefixRange(prefix))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Several kv values at once (one transaction). Returns { key: value } for the keys found. */
export async function loadMany(keys) {
  const out = {}
  await run(STORE, 'readonly', (tx) => {
    const st = tx.objectStore(STORE)
    for (const k of keys) {
      const req = st.get(k)
      req.onsuccess = () => { if (req.result !== undefined) out[k] = req.result }
    }
  })
  return out
}

export async function remove(key) {
  return run(STORE, 'readwrite', (tx) => { tx.objectStore(STORE).delete(key) })
}

// ---------- photos ----------

/** Which products have a photo: { upc: { w, h, source, addedAt } }. Small: no pictures are read. */
export async function loadPhotoIndex() {
  const d = await db()
  return new Promise((resolve, reject) => {
    const st = d.transaction(PHOTO_INFO).objectStore(PHOTO_INFO)
    const keys = st.getAllKeys()
    const values = st.getAll()
    values.onsuccess = () => {
      const out = {}
      keys.result.forEach((k, i) => { out[k] = values.result[i] })
      resolve(out)
    }
    values.onerror = () => reject(values.error)
    keys.onerror = () => reject(keys.error)
  })
}

/**
 * The pictures of several products, read in ONE transaction.
 * part: 'thumb' (small, for the drawing and lists), 'full' (the photo as imported) or 'record' (everything).
 * Returns a Map upc -> Blob (or the whole record), only for the products that have one.
 */
export async function loadPhotos(upcs, part = 'thumb') {
  const out = new Map()
  if (!upcs.length) return out
  await run(PHOTOS, 'readonly', (tx) => {
    const st = tx.objectStore(PHOTOS)
    for (const upc of upcs) {
      const req = st.get(upc)
      req.onsuccess = () => {
        const r = req.result
        if (r) out.set(upc, part === 'record' ? r : r[part] || r.full)
      }
    }
  })
  return out
}

/** The light part of a photo record, kept in photoInfo. */
export const photoInfoOf = ({ w, h, source, addedAt }) => ({ w, h, source, addedAt })

/**
 * Save photo records [[upc, { thumb, full, w, h, source, addedAt }], ...] in one transaction.
 * A photo already saved is only replaced by a newer one (checked inside the transaction, so a photo pack
 * and the move from version 1 running at the same time cannot undo each other).
 * `removeKeys`: old kv keys to delete in the same transaction (moving photos from version 1).
 * All or nothing: if the phone is full, nothing of this batch is saved and the error says so.
 * Resolves with { upc: info } of the photos really written.
 */
export async function savePhotos(entries, { removeKeys = [] } = {}) {
  const stores = removeKeys.length ? [PHOTOS, PHOTO_INFO, STORE] : [PHOTOS, PHOTO_INFO]
  const written = {}
  return run(stores, 'readwrite', (tx) => {
    const photos = tx.objectStore(PHOTOS)
    const info = tx.objectStore(PHOTO_INFO)
    for (const [upc, rec] of entries) {
      const req = info.get(upc)
      req.onsuccess = () => {
        const mine = req.result
        if (mine && !replaces(rec, mine)) return // same rule as photosToWrite (your own photo is never replaced by a pack's)
        photos.put(rec, upc)
        info.put(photoInfoOf(rec), upc)
        written[upc] = photoInfoOf(rec)
      }
    }
    if (removeKeys.length) {
      const kv = tx.objectStore(STORE)
      for (const k of removeKeys) kv.delete(k)
    }
    return () => written
  })
}

/** How many photos are saved (counted without reading them). */
export async function countPhotos() {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(PHOTO_INFO).objectStore(PHOTO_INFO).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function removePhoto(upc) {
  return run([PHOTOS, PHOTO_INFO, STORE], 'readwrite', (tx) => {
    tx.objectStore(PHOTOS).delete(upc)
    tx.objectStore(PHOTO_INFO).delete(upc)
    tx.objectStore(STORE).delete(`photo:${upc}`) // an old copy not moved yet
  })
}
