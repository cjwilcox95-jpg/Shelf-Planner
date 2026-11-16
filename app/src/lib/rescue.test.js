import { describe, expect, it } from 'vitest'
import { rescueBackup } from './rescue.js'
import { identifyFile } from './backup.js'

const plan = { id: 'p1', name: 'Ketchup', shelves: [{ id: 's1', widthIn: 48, depthIn: 24, clearanceIn: 12, items: [] }], tray: [] }

describe('rescue backup (made without the screens)', () => {
  it('reads plans, aisles, sizes and store data straight from storage into a normal backup file', async () => {
    const kv = { plans: { p1: plan }, catalog: { kind: 'shelf-planner-catalog', items: [{ upc: '400000000001' }] }, aisles: { a1: { id: 'a1', name: 'A', planIds: ['p1'] } } }
    const doc = await rescueBackup({
      read: async (k) => kv[k], readPrefix: async () => ({ 'size:400000000001': { w: { v: 3, src: 'measured' } } }), now: '2026-11-16T00:00:00.000Z',
    })
    expect(identifyFile(doc).type).toBe('backup')
    expect(doc.plans).toEqual([plan])
    expect(doc.aisles).toHaveLength(1)
    expect(doc.sizes).toEqual({ '400000000001': { w: { v: 3, src: 'measured' } } })
    expect(doc.photos).toEqual({})
  })
  it('still works when parts cannot be read or are damaged', async () => {
    const doc = await rescueBackup({
      read: async (k) => { if (k === 'catalog') throw new Error('unreadable'); return k === 'plans' ? { p1: plan } : k === 'aisles' ? 'nonsense' : undefined },
      readPrefix: async () => { throw new Error('unreadable') },
    })
    expect(doc.plans).toEqual([plan])
    expect(doc.catalog).toBeNull()
    expect(doc.aisles).toEqual([])
    expect(doc.sizes).toEqual({})
  })
})
