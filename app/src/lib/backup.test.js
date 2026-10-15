import { describe, it, expect } from 'vitest'
import { makeBackup, identifyFile, mergePlans, backupFileName } from './backup.js'

const plan = (id, updatedAt, name = id) => ({ id, name, updatedAt, shelves: [{ id: 's', items: [] }], tray: [] })

describe('backup', () => {
  it('holds every plan and the store data', () => {
    const b = makeBackup({ plans: { a: plan('a', 'T1'), b: plan('b', 'T1') }, catalog: { kind: 'shelf-planner-catalog' }, now: 'NOW' })
    expect(b.plans).toHaveLength(2)
    expect(b.catalog.kind).toBe('shelf-planner-catalog')
    expect(identifyFile(JSON.parse(JSON.stringify(b))).type).toBe('backup')
  })
  it('tells a catalog, a backup and anything else apart', () => {
    expect(identifyFile({ kind: 'shelf-planner-catalog', items: [{}] }).type).toBe('catalog')
    expect(identifyFile({ hello: 1 }).type).toBeNull()
    expect(identifyFile(null).problem).toMatch(/not a Shelf Planner file/)
  })
  it('merges without deleting anything on the phone', () => {
    const phone = { a: plan('a', '2026-10-02', 'phone A'), c: plan('c', '2026-10-01') }
    const { merged, counts } = mergePlans(phone, [plan('a', '2026-10-01', 'old A'), plan('b', '2026-10-01')])
    expect(Object.keys(merged).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.a.name).toBe('phone A') // phone copy was newer
    expect(counts).toMatchObject({ added: 1, keptPhone: 1, updated: 0 })
  })
  it('takes the backup copy when it is newer, and skips broken entries', () => {
    const { merged, counts } = mergePlans({ a: plan('a', '2026-10-01', 'phone') }, [plan('a', '2026-10-05', 'backup'), { id: 'x' }])
    expect(merged.a.name).toBe('backup')
    expect(counts).toMatchObject({ updated: 1, skipped: 1 })
  })
  it('names the file with the date', () => {
    expect(backupFileName(new Date('2026-10-15T12:00:00Z'))).toBe('shelf-planner-backup-2026-10-15.json')
  })
})
