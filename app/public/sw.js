// Offline support. Pages: try the network first, fall back to the saved copy.
// Other files (scripts, styles, icons): use the saved copy, fetching it the first time.
// Store data is NOT here; it lives in IndexedDB on the device.
const CACHE = 'shelf-planner-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))),
    )
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})
