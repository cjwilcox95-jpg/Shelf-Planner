// Getting your work out when a screen is broken: a backup made straight from what is saved on the phone,
// without going through the app's screens. Photos are left out (they come back from the photo packs, and
// leaving them out keeps this as simple, and as unlikely to fail, as possible).

import { load, loadPrefix } from './storage.js'
import { backupFileName, makeBackup, shareOrDownload } from './backup.js'

/** The backup document, read from storage. Anything that cannot be read is left out, never guessed. */
export async function rescueBackup({ read = load, readPrefix = loadPrefix, now } = {}) {
  const get = (k) => read(k).catch(() => null)
  const [plans, catalog, aisles, guessEdits, movement] = await Promise.all(['plans', 'catalog', 'aisles', 'guessEdits', 'movement'].map(get))
  const saved = await readPrefix('size:').catch(() => ({}))
  const sizes = Object.fromEntries(Object.entries(saved || {}).map(([k, v]) => [k.slice(5), v]))
  const obj = (x) => (x && typeof x === 'object' ? x : {})
  return makeBackup({
    plans: obj(plans), catalog: catalog || null, sizes, guessEdits: obj(guessEdits), movement: movement || null,
    aisles: Object.values(obj(aisles)), ...(now ? { now } : {}),
  })
}

/** Make the rescue backup and hand it to the share sheet or the downloads folder. Returns a plain message. */
export async function saveRescueBackup() {
  try {
    const doc = await rescueBackup()
    if (!doc.plans.length) return 'There are no plans saved on this phone yet.'
    const how = await shareOrDownload(JSON.stringify(doc), backupFileName())
    return how === 'cancelled' ? 'Backup cancelled.' : how === 'shared' ? 'Backup made.' : 'Backup downloaded.'
  } catch (e) {
    return `Could not make the backup: ${e?.message || e}`
  }
}
