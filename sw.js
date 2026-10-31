// Offline support, so the app opens in the aisle with no signal.
// - When the app is first opened online, every file it needs is saved (the list is filled in by the build).
// - Pages: try the network for a fresh copy, but after 3.5 s (a weak signal) use the saved copy.
// - Other files (scripts, styles, icons, the barcode reader): use the saved copy.
// - Each update gets its own saved copy; old ones are removed.
// Store data is NOT here; it lives in IndexedDB on the device.
const VERSION = "6934dd5d6f"
const ASSETS = ["./apple-touch-icon.png","./assets/index-DMJimcYH.css","./assets/index-p2z-wwuw.js","./assets/reader-DltecsD8.js","./assets/zxing_reader-Bb9Mx2Pu.wasm","./assets/zxing_reader-CAoQE-jl.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest"]
const CACHE = `shelf-planner-${VERSION}`

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's own short-term copy, so an update never saves yesterday's page
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...ASSETS].map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shelf-planner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const slow = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), ms))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      // always ask the server whether the page changed (a page request can't take options, so make a new one)
      const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      try {
        const res = await Promise.race([net, slow(3500)])
        if (res.ok) {
          const copy = res.clone() // copy now, before the page starts reading it
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      } catch {
        const saved = (await caches.match(req)) || (await caches.match('./'))
        return saved || net // nothing saved yet: keep waiting for the network
      }
    })())
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})
