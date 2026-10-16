// An aisle: several sections (plans) standing side by side, left to right.
// To edit it, the sections are joined into one "view" plan (all their shelves, with a note of which
// section each shelf belongs to). Every change is split back into the section plans, so a section is
// always an ordinary plan that can also be opened on its own.

import { newId } from './plan.js'

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function newAisle(name, planIds) {
  const t = new Date().toISOString()
  return { id: newId('a'), name: name || 'New aisle', planIds: [...planIds], createdAt: t, updatedAt: t }
}

/** Width of a section: its widest shelf. */
export const sectionWidth = (plan) => Math.max(...plan.shelves.map((s) => s.widthIn))

/** The aisle as one plan for the screen. Sections whose plan was deleted are left out. */
export function makeAisleView(aisle, plans) {
  const members = aisle.planIds.map((id) => plans[id]).filter(Boolean)
  let offsetIn = 0
  const sections = members.map((p, i) => {
    const s = { planId: p.id, name: p.name, letter: LETTERS[i] || String(i + 1), shelfIds: p.shelves.map((x) => x.id), widthIn: sectionWidth(p), offsetIn }
    offsetIn += s.widthIn
    return s
  })
  return {
    id: `aisle:${aisle.id}`,
    aisleId: aisle.id,
    name: aisle.name,
    note: '',
    createdAt: aisle.createdAt,
    updatedAt: members.reduce((t, p) => ((p.updatedAt || '') > t ? p.updatedAt : t), aisle.updatedAt || ''),
    sections,
    shelves: members.flatMap((p) => p.shelves),
    tray: members.flatMap((p) => p.tray || []),
  }
}

/** Which section a shelf belongs to. */
export const sectionOf = (view, shelfId) => view.sections?.find((s) => s.shelfIds.includes(shelfId)) || null

/** Rows for drawing, top level first: row k holds shelf k (from the bottom) of every section, or null. */
export function aisleRows(view) {
  const byId = new Map(view.shelves.map((s) => [s.id, s]))
  const levels = Math.max(...view.sections.map((s) => s.shelfIds.length))
  const rows = []
  for (let k = levels - 1; k >= 0; k--) {
    rows.push(view.sections.map((sec) => (sec.shelfIds[k] ? { section: sec, shelf: byId.get(sec.shelfIds[k]), level: k + 1 } : null)))
  }
  return rows
}

/**
 * Split the edited view back into its section plans. Returns only the plans that changed, with a new
 * changed time. A product in the "off the shelf" tray stays with the section it last belonged to.
 */
export function splitAisleView(view, plans, now = new Date().toISOString()) {
  const out = {}
  const byId = new Map(view.shelves.map((s) => [s.id, s]))
  const ownerOfTrayItem = (uid) => {
    for (const sec of view.sections) {
      const p = plans[sec.planId]
      if (p && (p.tray?.some((i) => i.uid === uid) || p.shelves.some((s) => s.items.some((i) => i.uid === uid)))) return sec.planId
    }
    return view.sections[0]?.planId
  }
  const trays = Object.fromEntries(view.sections.map((s) => [s.planId, []]))
  for (const item of view.tray) trays[ownerOfTrayItem(item.uid)]?.push(item)
  for (const sec of view.sections) {
    const old = plans[sec.planId]
    if (!old) continue
    const shelves = sec.shelfIds.map((id) => byId.get(id)).filter(Boolean)
    const next = { ...old, shelves, tray: trays[sec.planId] }
    if (JSON.stringify([old.shelves, old.tray || []]) !== JSON.stringify([next.shelves, next.tray])) {
      out[sec.planId] = { ...next, updatedAt: now }
    }
  }
  return out
}

/** Merge aisles from a backup: newer wins, nothing is deleted. */
export function mergeAisles(existing, incoming) {
  const merged = { ...existing }
  for (const a of incoming || []) {
    if (!a || typeof a.id !== 'string' || !Array.isArray(a.planIds)) continue
    const clean = { id: a.id, name: String(a.name || 'Aisle'), planIds: a.planIds.map(String), createdAt: a.createdAt, updatedAt: a.updatedAt }
    if (!merged[a.id] || (clean.updatedAt || '') > (merged[a.id].updatedAt || '')) merged[a.id] = clean
  }
  return merged
}
