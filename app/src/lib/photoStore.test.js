import { describe, it, expect } from 'vitest'
import { importPhotos, isQuotaError, moveOldPhotos } from './photoStore.js'
import { batches, blobToDataUrl, dataUrlToBlob, photosToWrite, thumbSize, tilePhotoStyle, toStoredPhoto } from './photos.js'

// a real (tiny) JPEG header is not needed: the pictures are only moved around as bytes here
const DATA = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const pic = (addedAt = '2026-10-29', source = 'store website') => ({ data: DATA, w: 161, h: 300, source, addedAt })
const upc = (n) => String(n).padStart(12, '0')
const fakeThumb = async (blob) => new Blob(['small'], { type: blob.type })

describe('photo files', () => {
  it('turns a data URL into a Blob and back without changing a byte', async () => {
    const b = dataUrlToBlob(DATA)
    expect(b.type).toBe('image/jpeg')
    expect(b.size).toBe(10)
    expect(await blobToDataUrl(b)).toBe(DATA)
  })
  it('refuses anything that is not a data URL', () => {
    expect(() => dataUrlToBlob('http://elsewhere/x.png')).toThrow()
  })
  it('the small copy is at most 128 px on its longest side, never bigger than the photo', () => {
    expect(thumbSize(161, 300)).toEqual({ w: 69, h: 128 })
    expect(thumbSize(400, 200)).toEqual({ w: 128, h: 64 })
    expect(thumbSize(60, 90)).toEqual({ w: 60, h: 90 })
  })
  it('moves an old saved photo (a data URL) into the new record: the photo, its small copy, size, source, date', async () => {
    const rec = await toStoredPhoto(pic('2026-10-01', 'your photo'), { thumbOf: fakeThumb })
    expect(rec.full).toBeInstanceOf(Blob)
    expect(await blobToDataUrl(rec.full)).toBe(DATA)
    expect(await rec.thumb.text()).toBe('small')
    expect(rec).toMatchObject({ w: 161, h: 300, source: 'your photo', addedAt: '2026-10-01' })
    expect(rec.data).toBeUndefined() // no text copy kept
  })
  it('uses the photo itself as the small copy when the phone cannot shrink it', async () => {
    const rec = await toStoredPhoto(pic(), { thumbOf: async () => { throw new Error('cannot read') } })
    expect(rec.thumb).toBe(rec.full)
  })
})

describe('saving many photos', () => {
  it('splits a list into batches', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(batches([], 200)).toEqual([])
  })
  it('picks what to write: new photos, and newer copies only', () => {
    const phone = { [upc(1)]: { addedAt: '2026-10-20' }, [upc(2)]: { addedAt: '2026-10-01' } }
    const r = photosToWrite(phone, { [upc(1)]: pic('2026-10-05'), [upc(2)]: pic('2026-10-10'), [upc(3)]: pic(), bad: pic() })
    expect(r.changes.map(([u]) => u)).toEqual([upc(2), upc(3)])
    expect(r).toMatchObject({ added: 1, replaced: 1 })
  })
  it('writes 200 photos per transaction and says how far it got', async () => {
    const incoming = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [upc(i + 1), pic()]))
    const writes = []
    const progress = []
    const r = await importPhotos({}, incoming, {
      thumbOf: fakeThumb,
      save: async (entries) => { writes.push(entries.length); return {} },
      onProgress: (done, total) => progress.push(`${done} of ${total}`),
    })
    expect(writes).toEqual([200, 200, 50])
    expect(progress).toEqual(['200 of 450', '400 of 450', '450 of 450'])
    expect(r).toMatchObject({ added: 450, saved: 450, total: 450, outOfSpace: false })
  })
  it('stops when the phone is full and says how many were saved', async () => {
    const incoming = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [upc(i + 1), pic()]))
    let n = 0
    const full = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    const r = await importPhotos({}, incoming, { thumbOf: fakeThumb, save: async () => { if (++n === 3) throw full } })
    expect(r).toMatchObject({ saved: 400, total: 500, outOfSpace: true })
  })
  it('other errors are not hidden', async () => {
    await expect(importPhotos({}, { [upc(1)]: pic() }, { thumbOf: fakeThumb, save: async () => { throw new Error('broken') } })).rejects.toThrow('broken')
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError(new Error('broken'))).toBe(false)
  })
})

describe('moving photos saved by the first version', () => {
  /** A pretend kv store, where a save can fail half way (the phone switched off). */
  function oldPhone(values) {
    const kv = { ...values }
    const photos = {}
    let failNext = false
    return {
      kv, photos,
      failOnce: () => { failNext = true },
      keys: async (prefix) => Object.keys(kv).filter((k) => k.startsWith(prefix)).sort(),
      read: async (keys) => Object.fromEntries(keys.filter((k) => k in kv).map((k) => [k, kv[k]])),
      save: async (entries, { removeKeys }) => {
        if (failNext) { failNext = false; throw new Error('stopped') } // all or nothing, like a transaction
        for (const [u, rec] of entries) photos[u] = rec
        for (const k of removeKeys) delete kv[k]
        return Object.fromEntries(entries.map(([u, r]) => [u, { addedAt: r.addedAt }]))
      },
    }
  }

  it('moves every photo and deletes the old copies; a record that is not a picture stays', async () => {
    const phone = oldPhone({ [`photo:${upc(1)}`]: pic(), [`photo:${upc(2)}`]: pic(), 'photo:photo-downy': pic(), [`photo:${upc(3)}`]: { data: 'oops' }, plans: {} })
    const moved = await moveOldPhotos({ ...phone, thumbOf: fakeThumb, batchSize: 2 })
    expect(moved).toBe(3)
    expect(Object.keys(phone.photos).sort()).toEqual([upc(1), upc(2), 'photo-downy'])
    expect(Object.keys(phone.kv).sort()).toEqual([`photo:${upc(3)}`, 'plans'])
  })
  it('is safe to stop half way: the next start finishes the job', async () => {
    const phone = oldPhone(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`photo:${upc(i + 1)}`, pic()])))
    phone.failOnce()
    await expect(moveOldPhotos({ ...phone, thumbOf: fakeThumb, batchSize: 2 })).rejects.toThrow('stopped')
    expect(Object.keys(phone.kv)).toHaveLength(5) // nothing lost
    expect(await moveOldPhotos({ ...phone, thumbOf: fakeThumb, batchSize: 2 })).toBe(5)
    expect(Object.keys(phone.kv)).toHaveLength(0)
    expect(Object.keys(phone.photos)).toHaveLength(5)
    expect(await moveOldPhotos({ ...phone, thumbOf: fakeThumb })).toBe(0) // and again: nothing to do
  })
})

describe('photo on a tile', () => {
  it('one background layer per unit, fitted and standing on the bottom of each unit, lines between units', () => {
    const st = tilePhotoStyle({ url: 'blob:x', photoW: 100, photoH: 200, unitW: 20, unitH: 30, facings: 3, high: 2 })
    const layers = st.backgroundImage.split(/, (?=url|repeating)/)
    expect(layers.filter((l) => l.startsWith('url("blob:x")'))).toHaveLength(6)
    expect(layers.filter((l) => l.startsWith('repeating-linear-gradient'))).toHaveLength(2)
    // 100x200 in a 20x30 unit: 15 x 30, centered (2.5 px each side)
    expect(st.backgroundSize.split(', ').slice(2)).toEqual(Array(6).fill('15px 30px'))
    expect(st.backgroundPosition.split(', ').slice(2)).toEqual([
      'left 2.5px bottom 0px', 'left 2.5px bottom 30px', 'left 22.5px bottom 0px', 'left 22.5px bottom 30px', 'left 42.5px bottom 0px', 'left 42.5px bottom 30px',
    ])
  })
  it('a single unit has no lines', () => {
    const st = tilePhotoStyle({ url: 'blob:x', photoW: 300, photoH: 100, unitW: 30, unitH: 30, facings: 1, high: 1 })
    expect(st.backgroundImage).toBe('url("blob:x")')
    expect(st.backgroundSize).toBe('30px 10px')
  })
})
