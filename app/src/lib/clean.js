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
const RESET_ITEM = ['location', 'upc', 'description', 'casePack', 'size', 'facings', 'capacity', 'status', 'matchNote']
const RESET = ['id', 'name', 'date', 'source', 'widthFt', 'heightFt']

/** The store-data file with only known fields; AFI resets with no shelves are left out. */
export function cleanCatalog(doc) {
  const items = (doc.items || []).filter((i) => i && /^\d{12}$/.test(i.upc)).map((i) => pick(i, CATALOG_ITEM))
  const resets = (doc.resets || [])
    .filter((r) => r && Array.isArray(r.shelves) && r.shelves.length > 0)
    .map((r) => ({
      ...pick(r, RESET),
      shelves: r.shelves.map((s) => ({ shelf: s.shelf, depthIn: s.depthIn, items: (s.items || []).map((i) => pick(i, RESET_ITEM)) })),
      unallocated: (r.unallocated || []).map((i) => pick(i, RESET_ITEM)),
    }))
  return {
    kind: 'shelf-planner-catalog',
    version: doc.version,
    built: doc.built,
    sources: Array.isArray(doc.sources) ? doc.sources.map(String) : [],
    classNames: doc.classNames || {},
    subclassNames: doc.subclassNames || {},
    items,
    resets,
  }
}

const PLAN = ['id', 'name', 'note', 'createdAt', 'updatedAt']
const SHELF = ['id', 'widthIn', 'depthIn', 'clearanceIn', 'afiDepthIn']
const ITEM = ['uid', 'upc', 'facings', 'description', 'size', 'high']

function cleanItem(i) {
  if (i?.kind === 'gap') return { uid: String(i.uid), kind: 'gap', widthIn: Number(i.widthIn) || 2 }
  const out = pick(i, ITEM)
  out.facings = Math.max(1, Math.round(Number(out.facings) || 1))
  return out
}

/** A plan from a backup with only known fields. Empty spaces never sit in the tray. */
export function cleanPlan(p) {
  return {
    ...pick(p, PLAN),
    shelves: p.shelves.map((s) => ({ ...pick(s, SHELF), items: (s.items || []).filter((i) => i && i.uid).map(cleanItem) })),
    tray: (p.tray || []).filter((i) => i && i.uid && i.kind !== 'gap').map(cleanItem),
  }
}
