// Files coming in (catalog.json, backups) are trimmed to the fields the app knows.
// Anything else, such as a cost or price column added by hand, is dropped and never stored or copied into backups.

const pick = (obj, keys) => {
  const out = {}
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]
  return out
}

// Must match scripts/build_catalog.py (ALLOWED_FIELDS and ALLOWED_RESET_ITEM).
const CATALOG_ITEM = ['upc', 'description', 'pack', 'size', 'sizeValue', 'uom', 'sizeNote', 'classCode', 'subclassCode',
  'source', 'specialOrder', 'display', 'aisle']
const RESET_ITEM = ['location', 'upc', 'description', 'casePack', 'size', 'facings', 'capacity', 'status', 'matchNote', 'high']
const RESET = ['id', 'name', 'date', 'source', 'widthFt', 'heightFt', 'doors', 'fixture', 'source2026']

/** The store-data file with only known fields; AFI resets with no shelves are left out. */
/** A table of code -> name, plain text only (anything nested, such as a price, is dropped). */
function nameTable(t) {
  const out = {}
  if (!t || typeof t !== 'object') return out
  for (const [k, v] of Object.entries(t)) if (/^[\w-]{1,20}$/.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, 80)
  return out
}

export function cleanCatalog(doc) {
  const items = (doc.items || []).filter((i) => i && typeof i.upc === 'string' && /^\d{12}$/.test(i.upc))
    .map((i) => ({ ...pick(i, CATALOG_ITEM), description: String(i.description ?? '') }))
  const resets = (doc.resets || [])
    .filter((r) => r && Array.isArray(r.shelves) && r.shelves.length > 0)
    .map((r) => ({
      ...pick(r, RESET),
      id: String(r.id ?? r.name ?? ''),
      name: String(r.name ?? 'Set'),
      date: String(r.date ?? ''),
      widthFt: Number(r.widthFt) > 0 && Number(r.widthFt) <= 100 ? Number(r.widthFt) : 4,
      shelves: r.shelves.map((s) => ({ shelf: s.shelf, ...(s.door ? { door: s.door } : {}), ...(s.clearanceIn > 0 ? { clearanceIn: s.clearanceIn } : {}), depthIn: s.depthIn, items: (s.items || []).map((i) => pick(i, RESET_ITEM)) })),
      unallocated: (r.unallocated || []).map((i) => pick(i, RESET_ITEM)),
    }))
  const afiSizes = {}
  for (const [upc, r] of Object.entries(doc.afiSizes || {})) {
    const ok = (x) => typeof x === 'number' && x > 0 && x < 100
    if (!/^\d{12}$/.test(upc) || !ok(r?.w) || !ok(r?.h)) continue
    afiSizes[upc] = { w: r.w, h: r.h, ...(ok(r.d) ? { d: r.d } : {}), reset: String(r.reset || ''), date: String(r.date || '') }
  }
  return {
    kind: 'shelf-planner-catalog',
    version: String(doc.version ?? ''),
    built: String(doc.built ?? ''),
    sources: Array.isArray(doc.sources) ? doc.sources.map(String) : [],
    classNames: nameTable(doc.classNames),
    subclassNames: nameTable(doc.subclassNames),
    items,
    resets,
    afiSizes,
  }
}

const PLAN = ['id', 'name', 'note', 'createdAt', 'updatedAt']
const SHELF = ['id', 'widthIn', 'depthIn', 'clearanceIn', 'afiDepthIn']
const ITEM = ['uid', 'upc', 'facings', 'description', 'size', 'high']

const SHELF_DEFAULT = { widthIn: 48, depthIn: 24, clearanceIn: 12 } // same as plan.js SHELF_DEFAULTS
// a size in inches; a number written as text ("36") is read as the number, anything else gets the standard size
const inches = (raw, fallback, max = 600) => {
  const x = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  return typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= max ? x : fallback
}

function cleanItem(i) {
  if (i?.kind === 'gap') return { uid: String(i.uid), kind: 'gap', widthIn: inches(Number(i.widthIn), 2, 96) }
  const out = pick(i, ITEM)
  out.uid = String(out.uid)
  if (typeof out.upc === 'string' && out.upc) out.upc = String(out.upc)
  else delete out.upc // an AFI line whose barcode could not be read: it keeps its name and its place
  for (const k of ['description', 'size']) if (out[k] !== undefined) out[k] = String(out[k])
  out.facings = Math.max(1, Math.min(99, Math.round(Number(out.facings) || 1)))
  if (!(Number.isInteger(out.high) && out.high >= 2 && out.high <= 20)) delete out.high
  return out
}

// a product needs an id and something to know it by: a UPC, or at least a name (some AFI lines have no readable
// barcode; they must never be lost in a backup or a repair). An empty space needs an id.
const known = (i) => (typeof i.upc === 'string' && i.upc !== '') || (typeof i.description === 'string' && i.description.trim() !== '')
const usable = (i) => i && typeof i === 'object' && i.uid != null && (i.kind === 'gap' || known(i))

/** A plan from a backup with only known fields. Empty spaces never sit in the tray. Broken shelves are dropped. */
export function cleanPlan(p) {
  return {
    ...pick(p, PLAN),
    name: String(p.name ?? '').trim() || 'Plan',
    shelves: (p.shelves || []).filter((s) => s && typeof s === 'object').map((s) => ({
      ...pick(s, SHELF),
      widthIn: inches(s.widthIn, SHELF_DEFAULT.widthIn),
      depthIn: inches(s.depthIn, SHELF_DEFAULT.depthIn),
      clearanceIn: inches(s.clearanceIn, SHELF_DEFAULT.clearanceIn),
      items: (Array.isArray(s.items) ? s.items : []).filter(usable).map(cleanItem),
    })),
    tray: (Array.isArray(p.tray) ? p.tray : []).filter((i) => usable(i) && i.kind !== 'gap').map(cleanItem),
  }
}

const healthyItem = (i) => i && typeof i === 'object' && i.uid != null && (i.kind === 'gap' ? Number(i.widthIn) > 0 : known(i) && Number(i.facings) >= 1)
const size = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
const healthyShelf = (s) => s && typeof s === 'object' && typeof s.id === 'string' && size(s.widthIn) && size(s.depthIn) && size(s.clearanceIn) &&
  Array.isArray(s.items) && s.items.every(healthyItem)
/** Can the screens draw this plan as it is? */
export const healthyPlan = (p) => !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' &&
  Array.isArray(p.shelves) && p.shelves.length > 0 && p.shelves.every(healthyShelf) && Array.isArray(p.tray) && p.tray.every(healthyItem)

/**
 * The plans saved on the phone, checked before the screens use them. A healthy plan is passed on untouched.
 * A damaged one (a half-written save, an old format) is repaired with the same rules as a backup coming in:
 * broken products and shelves are dropped, missing sizes get the standard ones. A plan with nothing left to
 * draw is left out. `makeId` gives ids to shelves that lost theirs.
 * Returns { plans, repaired: [names], dropped: number }.
 */
export function repairPlans(saved, makeId = (i) => `s-repaired-${i}`) {
  const plans = {}
  const repaired = []
  let dropped = 0
  let n = 0
  for (const [key, p] of Object.entries(saved && typeof saved === 'object' ? saved : {})) {
    if (healthyPlan(p) && p.id === key) { plans[key] = p; continue }
    if (!p || typeof p !== 'object' || !Array.isArray(p.shelves)) { dropped++; continue }
    const fixed = cleanPlan({ ...p, id: key })
    fixed.shelves = fixed.shelves.map((s) => (typeof s.id === 'string' && s.id ? s : { ...s, id: makeId(n++) }))
    if (!fixed.shelves.length) { dropped++; continue }
    plans[key] = fixed
    repaired.push(fixed.name)
  }
  return { plans, repaired, dropped }
}
