import { describe, it, expect } from 'vitest'
import { expandUpcE, keysFromScan, matchScan } from './barcode.js'
import { parseInches, withFraction } from './tape.js'

describe('UPC-E (short barcodes on small packages)', () => {
  it('expands to the full UPC-A by the standard rules', () => {
    expect(expandUpcE('04252614')).toBe('042100005264') // the textbook example; last digit 1: manufacturer 42100
    expect(expandUpcE('01234572')).toBe('012345000072') // last digit 5-9: product 0000x
    expect(expandUpcE('01234543')).toBe('012340000053') // last digit 4
    expect(expandUpcE('01234531')).toBe('012300000451') // last digit 3
  })
  it('rejects a bad check digit or a non-UPC-E number', () => {
    expect(expandUpcE('04252615')).toBe(null)
    expect(expandUpcE('24252614')).toBe(null)
  })
})

describe('keysFromScan', () => {
  it('a UPC-A scan is used as is', () => {
    expect(keysFromScan('036800083004', 'UPCA')).toEqual(['036800083004'])
  })
  it('an EAN-13 with a leading 0 is the same product as the UPC-A', () => {
    expect(keysFromScan('0036800083004', 'EAN13')).toEqual(['036800083004'])
  })
  it('a UPC-E scan becomes the full UPC', () => {
    expect(keysFromScan('04252614', 'UPCE')).toEqual(['042100005264'])
  })
  it('a foreign EAN-13 cannot match a 12-digit UPC', () => {
    expect(keysFromScan('7501055300075', 'EAN13')).toEqual([])
  })
  it('typed numbers without the check digit still work', () => {
    expect(keysFromScan('03680008300')).toContain('036800083004')
  })
  it('picks the reading that is in the store data', () => {
    const has = (k) => k === '036800083004'
    expect(matchScan('3680008300', '', has).upc).toBe('036800083004') // 10 digits, leading 0 dropped
    expect(matchScan('012345000072', 'UPCA', has)).toMatchObject({ upc: null, best: '012345000072' })
  })
})

describe('parseInches (tape measure)', () => {
  it('reads decimals and fractions', () => {
    expect(parseInches('2.75')).toBe(2.75)
    expect(parseInches('.5')).toBe(0.5)
    expect(parseInches('2 3/4')).toBe(2.75)
    expect(parseInches('2-3/4')).toBe(2.75)
    expect(parseInches('3/8')).toBe(0.375)
    expect(parseInches('2¾')).toBe(2.75)
    expect(parseInches('10 1/2 in')).toBe(10.5)
    expect(parseInches('7"')).toBe(7)
  })
  it('gives NaN for blank or nonsense', () => {
    expect(parseInches('')).toBeNaN()
    expect(parseInches('abc')).toBeNaN()
    expect(parseInches('3/0')).toBeNaN()
  })
  it('puts a fraction on the typed number', () => {
    expect(withFraction('2', '3/4')).toBe('2 3/4')
    expect(withFraction('2 1/2', '3/4')).toBe('2 3/4')
    expect(withFraction('2.5', '1/4')).toBe('2 1/4')
    expect(withFraction('', '1/2')).toBe('1/2')
  })
})
