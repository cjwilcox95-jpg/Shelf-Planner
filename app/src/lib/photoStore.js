// Saving many photos at once (photo packs, backups) and moving photos saved by version 1 of the app.
// Photos are written a few hundred per transaction: one transaction per photo is very slow on a phone,
// and one for all 15,000 would hold every picture in memory at once.

import { batches, photosToWrite, toStoredPhoto } from './photos.js'
import { keysWithPrefix, loadMany, savePhotos } from './storage.js'

export const BATCH = 200
const OLD_PREFIX = 'photo:'

/** Did the phone run out of space? (Browsers name this error differently.) */
export const isQuotaError = (e) => e?.name === 'QuotaExceededError' || e?.code === 22 || /quota/i.test(e?.message || '')

/**
 * Save the photos of a pack or backup, never deleting any; a newer photo replaces an older one.
 * existing: what is on the phone (upc -> { addedAt, ... }).
 * onProgress(saved, total) after each batch; onSaved({ upc: info }) with what each batch really wrote.
 * Returns { added, replaced, total, saved, outOfSpace }: `saved` counts the photos written before
 * the phone ran out of space (then outOfSpace is true and the rest were not saved).
 */
export async function importPhotos(existing, incoming, {
  save = savePhotos, thumbOf, onProgress, onSaved, batchSize = BATCH,
} = {}) {
  const { changes, added, replaced } = photosToWrite(existing, incoming)
  let saved = 0
  let done = 0
  for (const batch of batches(changes, batchSize)) {
    const entries = []
    // a few at a time: each picture is opened to make its small copy, and phones have little memory for pictures
    await eachFew(batch, async ([upc, p]) => {
      try { entries.push([upc, await toStoredPhoto(p, thumbOf ? { thumbOf } : {})]) } catch { /* not a picture: skipped */ }
    })
    try {
      const written = await save(entries)
      onSaved?.(written || {})
    } catch (e) {
      if (isQuotaError(e)) return { added, replaced, total: changes.length, saved, outOfSpace: true }
      throw e
    }
    saved += entries.length
    done += batch.length
    onProgress?.(done, changes.length)
  }
  return { added, replaced, total: changes.length, saved, outOfSpace: false }
}

/**
 * Run `fn` on every item, at most `few` at the same time. Making a small copy mostly waits for the browser
 * (opening and saving the picture happen off the page), so several at once is much faster; 12 pictures of
 * 400 px are under 8 MB of memory.
 */
async function eachFew(list, fn, few = 12) {
  let next = 0
  const worker = async () => { while (next < list.length) await fn(list[next++]) }
  await Promise.all(Array.from({ length: Math.min(few, list.length) }, worker))
}

/** An old saved photo ({ data: data URL, w, h, ... }) that can be moved. */
const movable = (p) => p && typeof p.data === 'string' && p.data.startsWith('data:image/') && p.w > 0 && p.h > 0

/**
 * Move photos saved by version 1 (kv "photo:<upc>", as text) into the photos store, a batch at a time.
 * Each batch is written and its old keys deleted in the same transaction, so stopping half way (the app
 * closed, the phone off) loses nothing: the next start carries on with what is left.
 * A record that is not a picture stays where it is.
 */
export async function moveOldPhotos({
  keys = keysWithPrefix, read = loadMany, save = savePhotos, thumbOf, onSaved, batchSize = 50,
} = {}) {
  const all = await keys(OLD_PREFIX)
  let moved = 0
  for (const batch of batches(all, batchSize)) {
    const values = await read(batch)
    const entries = []
    const done = []
    await eachFew(batch, async (key) => {
      const p = values[key]
      if (!movable(p)) return
      try {
        entries.push([key.slice(OLD_PREFIX.length), await toStoredPhoto(p, thumbOf ? { thumbOf } : {})])
        done.push(key)
      } catch { /* not a picture: left as it is */ }
    })
    if (!done.length) continue
    // a newer photo already in the photos store is kept (savePhotos checks); the old copy goes either way
    const written = await save(entries, { removeKeys: done })
    onSaved?.(written || {})
    moved += done.length
  }
  return moved
}
