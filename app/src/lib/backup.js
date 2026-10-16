// Backup file: every plan plus the store data, in one file you keep (Files app, email to yourself, etc.).
// Importing MERGES into what is on the phone: nothing on the phone is deleted.

import { cleanPlan } from './clean.js'

export const BACKUP_KIND = 'shelf-planner-backup'

export function makeBackup({ plans, catalog, photos = {}, sizes = {}, guessEdits = {}, movement = null, now = new Date().toISOString() }) {
  return { kind: BACKUP_KIND, version: 1, exportedAt: now, plans: Object.values(plans), catalog: catalog || null, photos, sizes, guessEdits, movement }
}

export function backupFileName(now = new Date()) {
  const d = now.toISOString().slice(0, 10)
  return `shelf-planner-backup-${d}.json`
}

/** What kind of file did the person pick? */
export function identifyFile(doc) {
  if (doc?.kind === BACKUP_KIND && Array.isArray(doc.plans)) return { type: 'backup' }
  if (doc?.kind === 'shelf-planner-catalog' && Array.isArray(doc.items) && doc.items.length) return { type: 'catalog' }
  if (doc?.kind === 'shelf-planner-photos' && doc.photos && typeof doc.photos === 'object') return { type: 'photos' }
  if (doc?.kind === 'shelf-planner-sizes' && doc.sizes && typeof doc.sizes === 'object') return { type: 'sizes' }
  if (doc?.kind === 'shelf-planner-movement' && doc.items && typeof doc.items === 'object') return { type: 'movement' }
  return { type: null, problem: 'This is not a Shelf Planner file. Pick catalog.json, a photo pack, or a shelf-planner-backup file.' }
}

const looksLikePlan = (p) => p && typeof p.id === 'string' && Array.isArray(p.shelves) && p.shelves.length > 0 && Array.isArray(p.tray ?? [])

/**
 * Merge plans from a backup into the plans on this phone.
 * Same plan on both: the one changed more recently wins. Returns counts for a plain-English message.
 */
export function mergePlans(existing, incoming) {
  const merged = { ...existing }
  const counts = { added: 0, updated: 0, keptPhone: 0, skipped: 0 }
  for (const p of incoming) {
    if (!looksLikePlan(p)) { counts.skipped++; continue }
    const plan = cleanPlan({ tray: [], ...p })
    const mine = merged[p.id]
    if (!mine) { merged[p.id] = plan; counts.added++ }
    else if ((p.updatedAt || '') > (mine.updatedAt || '')) { merged[p.id] = plan; counts.updated++ }
    else counts.keptPhone++
  }
  return { merged, counts }
}

/**
 * Hand the file to the phone's share sheet (Save to Files, Print, Mail...), or download it on a computer.
 * data: text or a Blob.
 */
export async function shareOrDownload(data, filename, { type = 'application/json', title = 'Shelf Planner backup' } = {}) {
  const blob = data instanceof Blob ? data : new Blob([data], { type })
  try {
    const file = new File([blob], filename, { type: blob.type || type })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return 'shared'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 15000)
  return 'downloaded'
}
