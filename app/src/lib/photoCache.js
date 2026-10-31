// The small photos on screen, as object URLs (blob:...), kept in memory for at most `limit` products.
// The least recently asked-for are dropped first, and their URLs are let go (revoked) so the browser can
// free the picture. Products some part of the screen still shows ("pinned") are never dropped.

export const CACHE_LIMIT = 800

/**
 * load(upcs) -> Promise<Map upc -> Blob>, reading every picture asked for in one go.
 * createUrl / revokeUrl: URL.createObjectURL / URL.revokeObjectURL (replaceable in tests).
 */
export function createThumbCache({ load, limit = CACHE_LIMIT, createUrl = (b) => URL.createObjectURL(b), revokeUrl = (u) => URL.revokeObjectURL(u) }) {
  const urls = new Map() // upc -> url; Map order = least recently asked-for first
  const pending = new Map() // upc -> Promise while it is being read
  const stale = new Set() // changed while being read: what was read is the old photo
  const pins = new Map() // who -> Set of upcs that are on screen for them
  const listeners = new Set()

  const pinned = (upc) => { for (const s of pins.values()) if (s.has(upc)) return true; return false }
  const notify = () => { for (const fn of listeners) fn() }

  function touch(upc) {
    const u = urls.get(upc)
    urls.delete(upc)
    urls.set(upc, u)
  }

  function trim() {
    if (urls.size <= limit) return
    for (const [upc, u] of urls) {
      if (urls.size <= limit) break
      if (pinned(upc)) continue
      urls.delete(upc)
      revokeUrl(u)
    }
  }

  return {
    /** The URL of a product's small photo, if it has been read. */
    peek: (upc) => urls.get(upc),
    get size() { return urls.size },

    /** Keep these products in memory while `who` shows them (replaces what `who` pinned before). */
    pin(who, upcs) { pins.set(who, new Set(upcs)) },
    unpin(who) { pins.delete(who); trim() },

    /** Read the photos of these products that are not in memory yet: one read for all of them. */
    async ensure(upcs) {
      const missing = []
      const waits = []
      for (const upc of new Set(upcs)) {
        if (urls.has(upc)) touch(upc)
        else if (pending.has(upc) && !stale.has(upc)) waits.push(pending.get(upc))
        else missing.push(upc)
      }
      if (missing.length) {
        for (const upc of missing) stale.delete(upc) // this read gets the new photo
        let job
        const done = (upc) => { if (pending.get(upc) !== job) return false; pending.delete(upc); return true }
        job = load(missing).then((blobs) => {
          for (const upc of missing) {
            if (!done(upc) || stale.delete(upc)) continue // a newer read is on its way, or this one is out of date
            const b = blobs.get(upc)
            if (b && !urls.has(upc)) urls.set(upc, createUrl(b))
          }
          trim()
        }, (e) => { for (const upc of missing) if (done(upc)) stale.delete(upc); throw e })
        for (const upc of missing) pending.set(upc, job)
        waits.push(job)
      }
      await Promise.all(waits)
    },

    /** A product's photo changed or was removed: drop the old one. */
    forget(upc) {
      if (pending.has(upc)) stale.add(upc)
      const u = urls.get(upc)
      if (u === undefined) return
      urls.delete(upc)
      revokeUrl(u)
      notify()
    },

    /** Let go of everything (the app closed, or all photos changed). */
    clear() {
      for (const u of urls.values()) revokeUrl(u)
      urls.clear()
      notify()
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}
