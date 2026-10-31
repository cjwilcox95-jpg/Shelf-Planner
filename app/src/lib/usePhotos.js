// Photos for the screen. Only the products on screen are read from the phone's storage: their small copy
// for the drawing and the lists, and the photo itself for the selected product and for printing.

import { useEffect, useMemo, useReducer, useState } from 'react'
import { createThumbCache } from './photoCache.js'
import { loadPhotos } from './storage.js'

/** The small photos in memory, shared by every part of the screen. */
export const thumbs = createThumbCache({ load: (upcs) => loadPhotos(upcs, 'thumb') })

/**
 * Small photo URLs for these products: { upc: url }, for the products that have a photo (`index`), once read.
 * Pass a list that only changes when the products change (useMemo), as the photos are read when it does.
 */
export function useThumbs(upcs, index) {
  const list = useMemo(() => [...new Set(upcs)].filter((u) => index[u]).sort(), [upcs, index])
  const key = list.map((u) => `${u}@${index[u].addedAt}`).join('|')
  const [tick, bump] = useReducer((n) => n + 1, 0)
  useEffect(() => thumbs.subscribe(bump), [])
  useEffect(() => {
    const who = {}
    thumbs.pin(who, list)
    let live = true
    thumbs.ensure(list).then(() => { if (live) bump() }, (e) => console.error('could not read photos', e))
    return () => { live = false; thumbs.unpin(who) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const out = {}
    for (const u of list) {
      const url = thumbs.peek(u)
      if (url) out[u] = url
    }
    return out
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The photo itself (not the small copy) of one product, as a URL, or null until it is read. */
export function useFullPhoto(upc, info) {
  const stamp = upc && info ? `${upc}@${info.addedAt}` : ''
  const [got, setGot] = useState({ stamp: '', url: null })
  useEffect(() => {
    if (!stamp) return undefined
    let live = true
    let made = null
    loadPhotos([upc], 'full').then((m) => {
      const b = m.get(upc)
      if (!live || !b) return
      made = URL.createObjectURL(b)
      setGot({ stamp, url: made })
    }, () => {})
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [stamp]) // eslint-disable-line react-hooks/exhaustive-deps
  return got.stamp === stamp ? got.url : null
}

/**
 * The photos themselves for printing: { urls: { upc: url }, release() }. Read in one go;
 * call release() when the pages are drawn.
 */
export async function loadFullPhotoUrls(upcs) {
  const blobs = await loadPhotos([...new Set(upcs)], 'full')
  const urls = {}
  for (const [upc, b] of blobs) urls[upc] = URL.createObjectURL(b)
  return { urls, release: () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u) } }
}
