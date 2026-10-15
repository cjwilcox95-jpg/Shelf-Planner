import { describe, it, expect } from 'vitest'
import { guessDims, packageTypeFor, sizeInOz, parseSize } from './guess.js'

describe('guessDims', () => {
  it('matches the 20 oz squeeze bottle reference (about 2.75 in wide)', () => {
    const g = guessDims({ text: 'FRENCHS MUSTARD SQUEEZE', sizeValue: 20, uom: 'OZ' })
    expect(g.type).toBe('squeeze')
    expect(g.w).toBe(2.75)
  })
  it('makes bigger sizes bigger, but not proportionally', () => {
    const small = guessDims({ text: 'HNZ KETCHUP PLASTIC', sizeValue: 14, uom: 'OZ' })
    const big = guessDims({ text: 'HNZ KETCHUP PLASTIC', sizeValue: 64, uom: 'OZ' })
    expect(big.w).toBeGreaterThan(small.w)
    expect(big.w / small.w).toBeLessThan(64 / 14)
  })
  it('reads sizes printed as text', () => {
    const g = guessDims({ text: 'VLASIC KOSHER DILL WHOLE', size: '32 OZ' })
    expect(g.type).toBe('jar')
    expect(g.w).toBeGreaterThan(3.4)
  })
  it('falls back to a typical size when there is no usable size', () => {
    const g = guessDims({ text: 'BIC LIGHTER REGULAR', size: 'TRAY' })
    expect(g.type).toBe('other')
    expect(g).toMatchObject({ w: 3.5, h: 6, d: 3.5 })
  })
  it('rounds to the nearest quarter inch', () => {
    const g = guessDims({ text: 'HNZ KETCHUP', sizeValue: 38, uom: 'OZ' })
    for (const v of [g.w, g.h, g.d]) expect((v * 4) % 1).toBe(0)
  })
  it('keeps extreme sizes within limits', () => {
    const g = guessDims({ text: 'HNZ VOL PAK TOMATO KETCHUP', sizeValue: 3, uom: 'GL' })
    expect(g.w).toBeLessThanOrEqual(2.75 * 2.5 + 0.125) // cap, then quarter-inch rounding
  })
})

describe('guesses refined from the aisle photos', () => {
  const LAUNDRY = 'DETERGENTS LAUNDRY FABRIC SOFTENER DETERGENTS LIQUID LAUNDRY'
  const g = (text, sizeValue, scope = LAUNDRY) => guessDims({ text, scope, sizeValue, uom: 'OZ' })
  it('detergent jugs: 100 oz about 7.6 in wide, 50 oz about 6 in', () => {
    expect(g('SD LIQUID DET ORIGINAL RD', 100)).toMatchObject({ type: 'jug', w: 7.5 })
    expect(g('SD LIQ DET ORIGINAL GREEN', 50).w).toBe(6)
  })
  it('bleach jugs are narrower than detergent jugs', () => {
    expect(g('CLOROX BLEACH LIQ REG CONCNTD', 121, 'DETERGENTS LAUNDRY FABRIC SOFTENER BLEACH')).toMatchObject({ type: 'bleachjug', w: 6 })
    expect(g('SD BLEACH LIQ REG 7.5 PCT', 43, 'BLEACH').w).toBe(4.25)
  })
  it('starch cans and trigger sprays', () => {
    expect(g('FAULTLESS STARCH FRESH', 20)).toMatchObject({ type: 'aerosol', w: 2.5 })
    expect(g('SHOUT LIQUID TRIGGER', 22, 'FABRIC STAIN REMOVER - PREWASHES')).toMatchObject({ type: 'trigger', w: 4.25 })
  })
  it('laundry rules stay inside laundry categories', () => {
    expect(g('CHARMIN ULTRA SOFT MEGA PACKS', 12, 'BATH TISSUE LARGE PACKS 8CT&UP').type).not.toBe('tub')
    expect(g('ARM HAMMER BAKING POWDER', 8, 'BAKING SODA - BAKING POWDER').type).not.toBe('tub')
    expect(g('DAWN ULTRA DISH LIQ', 19, 'DETERGENT DISH LIQUIDS').type).toBe('squeeze')
    expect(g('RIT DYE POWDER BLACK', null, 'DETERGENTS LAUNDRY FABRIC SOFTENER FABRIC DYES').type).toBe('dye')
  })
})

describe('helpers', () => {
  it('converts units to ounces', () => {
    expect(sizeInOz(2, 'LB')).toBe(32)
    expect(sizeInOz(1, 'GL')).toBe(128)
    expect(sizeInOz(5, 'CT')).toBeNull()
  })
  it('parses a size string', () => {
    expect(parseSize('64.00 OZ')).toEqual({ value: 64, uom: 'OZ' })
    expect(parseSize('TRAY')).toEqual({ value: null, uom: null })
  })
  it('checks pouch and can before jar words', () => {
    expect(packageTypeFor('MT OLIVE KOSHR DIL CHIP POUCH').id).toBe('pouch')
    expect(packageTypeFor('FDC GREEN BEANS CUT CAN').id).toBe('can')
  })
})
