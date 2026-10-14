// Everything is saved on this device, in the browser's IndexedDB. Nothing is sent anywhere.

const DB_NAME = 'shelf-planner'
const STORE = 'kv'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbPromise
const db = () => (dbPromise ||= open())

export async function load(key) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function save(key, value) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
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

/** Check a picked file really is a Shelf Planner store-data file before saving it. */
export function validateCatalog(doc) {
  if (!doc || doc.kind !== 'shelf-planner-catalog') return 'This is not a Shelf Planner store-data file.'
  if (!Array.isArray(doc.items) || !doc.items.length) return 'The file has no products in it.'
  return null
}
