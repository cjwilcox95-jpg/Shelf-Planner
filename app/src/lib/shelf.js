// Shelf editing with undo/redo. Every change makes a new shelf object (nothing is changed in place),
// so undo is just "go back to the previous shelf".

export const DEFAULT_SHELF = { widthIn: 48, depthIn: 24, clearanceIn: 12 }
const HISTORY_LIMIT = 200

let counter = 0
export const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`

export function emptyShelf(name = 'My shelf') {
  return { name, ...DEFAULT_SHELF, items: [], note: '' }
}

/** Move the item at `from` so it ends up just before what is now at `insertBefore` (0..n). */
export function moveItem(items, from, insertBefore) {
  if (from < 0 || from >= items.length) return items
  let to = Math.max(0, Math.min(items.length, insertBefore))
  if (to > from) to -= 1
  if (to === from) return items
  const next = items.slice()
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

export function applyAction(shelf, a) {
  const items = shelf.items
  const idx = (uid) => items.findIndex((i) => i.uid === uid)
  switch (a.type) {
    case 'add': {
      const item = { uid: a.uid || newUid(), upc: a.upc, facings: a.facings || 1, description: a.description, size: a.size }
      const at = a.index == null ? items.length : Math.max(0, Math.min(items.length, a.index))
      return { ...shelf, items: [...items.slice(0, at), item, ...items.slice(at)] }
    }
    case 'move': {
      const from = idx(a.uid)
      const next = moveItem(items, from, a.insertBefore)
      return next === items ? shelf : { ...shelf, items: next }
    }
    case 'remove':
      return { ...shelf, items: items.filter((i) => i.uid !== a.uid) }
    case 'facings': {
      const n = Math.max(1, Math.min(99, Math.round(a.facings)))
      return { ...shelf, items: items.map((i) => (i.uid === a.uid ? { ...i, facings: n } : i)) }
    }
    case 'shelf': // width / depth / clearance / name
      return { ...shelf, ...a.changes }
    case 'load':
      return a.shelf
    default:
      return shelf
  }
}

export const initHistory = (shelf) => ({ past: [], present: shelf, future: [] })

export function historyReducer(h, a) {
  if (a.type === 'undo') {
    if (!h.past.length) return h
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
  }
  if (a.type === 'redo') {
    if (!h.future.length) return h
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
  }
  if (a.type === 'replaceAll') return initHistory(a.shelf)
  const next = applyAction(h.present, a)
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}
