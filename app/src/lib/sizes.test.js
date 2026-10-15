import { describe, it, expect } from 'vitest'
import { resolveDims, cleanSizes, mergeSizes, measureFromPhoto } from './sizes.js'

const guess = { w: 2.75, h: 8.5, d: 2.1 }

describe('resolveDims', () => {
  it('uses guesses when nothing is known', () => {
    expect(resolveDims(guess, undefined)).toEqual({ ...guess, source: { w: 'guess', h: 'guess', d: 'guess' } })
  })
  it('replaces only the dimensions that are known', () => {
    const r = resolveDims(guess, { w: { v: 3.1, src: 'measured' }, h: { v: 7.9, src: 'photo' } })
    expect(r).toEqual({ w: 3.1, h: 7.9, d: 2.1, source: { w: 'measured', h: 'photo', d: 'guess' } })
  })
  it('ignores broken values', () => {
    expect(resolveDims(guess, { w: { v: -1, src: 'measured' }, d: { v: 3, src: 'made up' } }).source)
      .toEqual({ w: 'guess', h: 'guess', d: 'guess' })
  })
})

describe('cleanSizes / mergeSizes', () => {
  const T1 = '2026-10-15T01:00:00Z'
  const T2 = '2026-10-16T01:00:00Z'
  it('keeps only good records', () => {
    const r = cleanSizes({
      '036800083004': { w: { v: 3, src: 'photo' }, updatedAt: T1 },
      'not-a-upc': { w: { v: 3, src: 'photo' } },
      '012345678905': { w: { v: 900, src: 'measured' } },
    })
    expect(Object.keys(r)).toEqual(['036800083004'])
  })
  it('accepts stand-in ids for products not in the store files', () => {
    expect(Object.keys(cleanSizes({ 'photo-rit_rust': { w: { v: 2.7, src: 'photo' } } }))).toEqual(['photo-rit_rust'])
  })
  it('never lets a photo estimate replace a tape measurement', () => {
    const phone = { '036800083004': { w: { v: 3.0, src: 'measured' }, updatedAt: T1 } }
    const { merged } = mergeSizes(phone, { '036800083004': { w: { v: 3.4, src: 'photo' }, h: { v: 8, src: 'photo' }, updatedAt: T2 } })
    expect(merged['036800083004'].w).toEqual({ v: 3.0, src: 'measured' })
    expect(merged['036800083004'].h).toEqual({ v: 8, src: 'photo' }) // fills the gap
  })
  it('a newer measurement replaces an older one', () => {
    const phone = { '036800083004': { w: { v: 3.4, src: 'photo' }, updatedAt: T1 } }
    const { merged, changed } = mergeSizes(phone, { '036800083004': { w: { v: 3.0, src: 'measured' }, updatedAt: T2 } })
    expect(merged['036800083004'].w.v).toBe(3.0)
    expect(changed).toBe(1)
  })
})

describe('measureFromPhoto', () => {
  it('scales by the known length', () => {
    // a 48 in shelf spans 960 px; the product spans 55 px -> 2.75 in
    expect(measureFromPhoto({ x: 0, y: 0 }, { x: 960, y: 0 }, 48, { x: 100, y: 5 }, { x: 155, y: 5 })).toBeCloseTo(2.75)
  })
  it('works on a slant (distance, not just sideways)', () => {
    expect(measureFromPhoto({ x: 0, y: 0 }, { x: 30, y: 40 }, 10, { x: 0, y: 0 }, { x: 60, y: 80 })).toBeCloseTo(20)
  })
  it('refuses nonsense', () => {
    expect(measureFromPhoto({ x: 1, y: 1 }, { x: 1, y: 1 }, 48, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull()
  })
})
