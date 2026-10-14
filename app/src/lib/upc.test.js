import { describe, it, expect } from 'vitest'
import { checkDigit, isValidUpc12, candidateKeys, prettyUpc } from './upc.js'

describe('UPC', () => {
  it('calculates check digits like the data-prep scripts', () => {
    expect(checkDigit('03600029145')).toBe(2)
    expect(checkDigit('01234567890')).toBe(5)
    expect(isValidUpc12('036000291452')).toBe(true)
    expect(isValidUpc12('036000291453')).toBe(false)
  })
  it('understands a full scanned barcode and the AFI short forms', () => {
    expect(candidateKeys('036000291452')[0]).toBe('036000291452')
    expect(candidateKeys('0-36000-29145')).toContain('036000291452')
    expect(candidateKeys('3600029145')).toContain('036000291452')
  })
  it('formats like a shelf tag', () => {
    expect(prettyUpc('036000291452')).toBe('0-36000-29145-2')
  })
})
