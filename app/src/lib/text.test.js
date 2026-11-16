import { describe, expect, it } from 'vitest'
import { niceName, niceSize } from './text.js'

describe('names and sizes on screen', () => {
  it('writes names in normal case and keeps short codes', () => {
    expect(niceName('HNZ KETCHUP SQZ')).toBe('HNZ Ketchup SQZ')
    expect(niceName('RED BARN BBQ SAUCE')).toBe('Red Barn BBQ Sauce')
    expect(niceName('KETCHUP-MUSTARD')).toBe('Ketchup-Mustard')
    expect(niceName("FRENCH'S MUSTARD")).toBe("French's Mustard")
    expect(niceName('Banquet Dinners')).toBe('Banquet Dinners')
    expect(niceName('')).toBe('')
    expect(niceName(null)).toBe('')
  })
  it('writes size units in small letters', () => {
    expect(niceSize('20 OZ')).toBe('20 oz')
    expect(niceSize('12 CT')).toBe('12 ct')
    expect(niceSize(undefined)).toBe('')
  })
})
