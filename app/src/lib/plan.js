// A plan is one section: several shelves stacked up, plus an "off the shelf" tray.
// shelves[0] is the BOTTOM shelf (AFI's "shelf 1"). The screen draws them top shelf first.
// Every change makes a new plan object, so undo is just "go back to the previous plan".

export const SHELF_DEFAULTS = { widthIn: 48, depthIn: 24, clearanceIn: 12 }
export const TRAY = 'tray'
const HISTORY_LIMIT = 200

let counter = 0
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function newShelf(over = {}) {
  return { id: newId('s'), ...SHELF_DEFAULTS, items: [], ...over }
}

export function newPlan({ name = 'New plan', shelves = 5, widthIn = 48 } = {}) {
  const t = new Date().toISOString()
  return {
    id: newId('p'), name, note: '', createdAt: t, updatedAt: t,
    shelves: Array.from({ length: Math.max(1, shelves) }, () => newShelf({ widthIn })),
    tray: [],
  }
}

const itemFrom = (i) => ({ uid: newId('i'), upc: i.upc, facings: i.facings || 1, description: i.description, size: i.size })

/** A whole AFI reset as a plan: every shelf with AFI's facings; items AFI left off go to the tray. */
export function planFromAfi(reset) {
  const p = newPlan({ name: `${reset.name} (AFI ${reset.date})`, shelves: 0 })
  p.shelves = [...reset.shelves]
    .sort((a, b) => a.shelf - b.shelf)
    .map((s) => newShelf({ widthIn: reset.widthFt * 12, items: s.items.map(itemFrom), afiDepthIn: s.depthIn }))
  p.tray = (reset.unallocated || []).map(itemFrom)
  const d = reset.shelves.map((s) => s.depthIn)
  const depths = Math.min(...d) === Math.max(...d) ? `${d[0]}` : `${Math.min(...d)}–${Math.max(...d)}`
  p.note = `From the AFI ${reset.name} reset (${reset.date}), ${reset.widthFt} ft. AFI planned these shelves ${depths} in deep; they are set to your standard 24 in.`
  return p
}

/** Plans saved by Stage 2 (one shelf) become a one-shelf plan. */
export function planFromOldShelf(shelf) {
  const p = newPlan({ name: shelf.name || 'My shelf', shelves: 0 })
  p.shelves = [newShelf({ widthIn: shelf.widthIn, depthIn: shelf.depthIn, clearanceIn: shelf.clearanceIn, items: shelf.items || [] })]
  p.note = shelf.note || ''
  return p
}

export function duplicatePlan(plan, name) {
  const t = new Date().toISOString()
  const copy = JSON.parse(JSON.stringify(plan))
  copy.id = newId('p')
  copy.name = name || `${plan.name} (copy)`
  copy.createdAt = t
  copy.updatedAt = t
  for (const s of copy.shelves) s.id = newId('s')
  return copy
}

/** Where is this item? Returns { where: shelfId or TRAY, index } or null. */
export function findItem(plan, uid) {
  for (const s of plan.shelves) {
    const index = s.items.findIndex((i) => i.uid === uid)
    if (index >= 0) return { where: s.id, index, item: s.items[index] }
  }
  const index = plan.tray.findIndex((i) => i.uid === uid)
  return index >= 0 ? { where: TRAY, index, item: plan.tray[index] } : null
}

const listOf = (plan, where) => (where === TRAY ? plan.tray : plan.shelves.find((s) => s.id === where)?.items)

function withList(plan, where, items) {
  if (where === TRAY) return { ...plan, tray: items }
  return { ...plan, shelves: plan.shelves.map((s) => (s.id === where ? { ...s, items } : s)) }
}

function mapItem(plan, uid, fn) {
  return {
    ...plan,
    shelves: plan.shelves.map((s) => (s.items.some((i) => i.uid === uid) ? { ...s, items: s.items.map((i) => (i.uid === uid ? fn(i) : i)) } : s)),
    tray: plan.tray.map((i) => (i.uid === uid ? fn(i) : i)),
  }
}

/**
 * Move an item to `to` (a shelf id or TRAY) so it lands just before what is now at
 * `insertBefore` in that list (0..length). Works within one shelf or across shelves.
 */
export function moveTo(plan, uid, to, insertBefore) {
  const from = findItem(plan, uid)
  const target = listOf(plan, to)
  if (!from || !target) return plan
  if (to === TRAY && from.item.kind === 'gap') return plan // an empty space is never "off the shelf"
  let at = Math.max(0, Math.min(target.length, insertBefore ?? target.length))
  if (from.where === to) {
    if (at === from.index || at === from.index + 1) return plan // dropped where it already was
    if (at > from.index) at -= 1
    const next = target.slice()
    next.splice(from.index, 1)
    next.splice(at, 0, from.item)
    return withList(plan, to, next)
  }
  const source = listOf(plan, from.where).filter((i) => i.uid !== uid)
  const dest = target.slice()
  dest.splice(at, 0, from.item)
  return withList(withList(plan, from.where, source), to, dest)
}

const clampGap = (w) => Math.max(0.25, Math.min(96, Math.round((Number(w) || 0.25) * 4) / 4))

export function applyPlanAction(plan, a) {
  switch (a.type) {
    case 'add': {
      const shelf = plan.shelves.find((s) => s.id === a.shelfId) || plan.shelves[plan.shelves.length - 1]
      const item = { uid: a.uid || newId('i'), upc: a.upc, facings: a.facings || 1, description: a.description, size: a.size }
      const at = a.index == null ? shelf.items.length : Math.max(0, Math.min(shelf.items.length, a.index))
      return withList(plan, shelf.id, [...shelf.items.slice(0, at), item, ...shelf.items.slice(at)])
    }
    case 'move':
      return moveTo(plan, a.uid, a.to, a.insertBefore)
    case 'takeOff': {
      const f = findItem(plan, a.uid)
      if (f?.item.kind === 'gap') return withList(plan, f.where, listOf(plan, f.where).filter((i) => i.uid !== a.uid))
      return !f || f.where === TRAY ? plan : moveTo(plan, a.uid, TRAY, 0)
    }
    case 'deleteItem': {
      const f = findItem(plan, a.uid)
      return f ? withList(plan, f.where, listOf(plan, f.where).filter((i) => i.uid !== a.uid)) : plan
    }
    case 'addGap': { // an empty space left on purpose
      const shelf = plan.shelves.find((s) => s.id === a.shelfId) || plan.shelves[plan.shelves.length - 1]
      const gap = { uid: a.uid || newId('g'), kind: 'gap', widthIn: clampGap(a.widthIn ?? 2) }
      const at = a.index == null ? shelf.items.length : Math.max(0, Math.min(shelf.items.length, a.index))
      return withList(plan, shelf.id, [...shelf.items.slice(0, at), gap, ...shelf.items.slice(at)])
    }
    case 'gapWidth':
      return mapItem(plan, a.uid, (i) => (i.kind === 'gap' ? { ...i, widthIn: clampGap(a.widthIn) } : i))
    case 'high': { // units stacked on top of each other
      const n = Math.max(1, Math.min(20, Math.round(a.high)))
      return mapItem(plan, a.uid, (i) => (n === 1 ? (({ high, ...rest }) => rest)(i) : { ...i, high: n }))
    }
    case 'facings': {
      const n = Math.max(1, Math.min(99, Math.round(a.facings)))
      return mapItem(plan, a.uid, (i) => ({ ...i, facings: n }))
    }
    case 'shelf': // width / depth / clearance for one shelf, or every shelf when a.all
      return { ...plan, shelves: plan.shelves.map((s) => (a.all || s.id === a.shelfId ? { ...s, ...a.changes } : s)) }
    case 'addShelf': {
      const top = plan.shelves[plan.shelves.length - 1]
      const bottom = plan.shelves[0]
      const like = a.position === 'bottom' ? bottom : top
      const s = newShelf(like ? { widthIn: like.widthIn, depthIn: like.depthIn, clearanceIn: like.clearanceIn } : {})
      if (a.id) s.id = a.id
      return { ...plan, shelves: a.position === 'bottom' ? [s, ...plan.shelves] : [...plan.shelves, s] }
    }
    case 'removeShelf': {
      if (plan.shelves.length <= 1) return plan
      const s = plan.shelves.find((x) => x.id === a.shelfId)
      if (!s) return plan
      return { ...plan, shelves: plan.shelves.filter((x) => x.id !== a.shelfId), tray: [...s.items, ...plan.tray] }
    }
    case 'rename':
      return { ...plan, name: a.name }
    default:
      return plan
  }
}

/** Position numbers left to right, counting products only (empty spaces get none). uid -> 1, 2, 3... */
export function positions(items) {
  const m = new Map()
  let n = 0
  for (const i of items) if (i.kind !== 'gap') m.set(i.uid, ++n)
  return m
}

/** Shelf number as AFI counts it: 1 = bottom. */
export const shelfNumber = (plan, shelfId) => plan.shelves.findIndex((s) => s.id === shelfId) + 1

export function shelfLabel(plan, shelfId) {
  const n = shelfNumber(plan, shelfId)
  const total = plan.shelves.length
  if (total === 1) return 'Shelf 1'
  return `Shelf ${n}${n === 1 ? ' (bottom)' : n === total ? ' (top)' : ''}`
}

// ---------- undo / redo ----------

export const initHistory = (plan) => ({ past: [], present: plan, future: [] })

export function historyReducer(h, a) {
  if (a.type === 'undo') {
    if (!h.past.length) return h
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
  }
  if (a.type === 'redo') {
    if (!h.future.length) return h
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
  }
  if (a.type === 'open') return initHistory(a.plan) // switching plans starts fresh undo
  const next = applyPlanAction(h.present, a)
  if (next === h.present) return h
  const stamped = { ...next, updatedAt: a.now || new Date().toISOString() }
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: stamped, future: [] }
}
