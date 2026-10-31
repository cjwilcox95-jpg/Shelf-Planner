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
const inches = (x, fallback, max = 600) => (typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= max ? x : fallback)

function cleanItem(i) {
  if (i?.kind === 'gap') return { uid: String(i.uid), kind: 'gap', widthIn: inches(Number(i.widthIn), 2, 96) }
  const out = pick(i, ITEM)
  out.uid = String(out.uid)
  out.upc = String(out.upc)
  for (const k of ['description', 'size']) if (out[k] !== undefined) out[k] = String(out[k])
  out.facings = Math.max(1, Math.min(99, Math.round(Number(out.facings) || 1)))
  if (!(Number.isInteger(out.high) && out.high >= 2 && out.high <= 20)) delete out.high
  return out
}

// a product needs an id and a UPC; an empty space needs an id
const usable = (i) => i && typeof i === 'object' && i.uid != null && (i.kind === 'gap' || (typeof i.upc === 'string' && i.upc))

/** A plan from a backup with only known fields. Empty spaces never sit in the tray. Broken shelves are dropped. */
export function cleanPlan(p) {
  return {
    ...pick(p, PLAN),
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
