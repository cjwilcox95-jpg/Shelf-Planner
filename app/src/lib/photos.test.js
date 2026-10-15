import { describe, it, expect } from 'vitest'
import { contentBox, hasWhiteBorder, cleanPhotos, mergePhotos } from './photos.js'

/** A white w x h picture with a dark rectangle at (x, y, rw, rh). */
function picture(w, h, rect) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255)
  if (rect) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = (y * w + x) * 4
        d[i] = 200; d[i + 1] = 30; d[i + 2] = 30
      }
    }
  }
  return d
}

describe('trimming white space', () => {
  it('finds the product inside a white picture', () => {
    expect(contentBox(picture(20, 30, { x: 5, y: 3, w: 8, h: 20 }), 20, 30)).toEqual({ x: 5, y: 3, w: 8, h: 20 })
  })
  it('returns nothing for a blank picture', () => {
    expect(contentBox(picture(10, 10), 10, 10)).toBeNull()
  })
  it('treats see-through pixels as background', () => {
    const d = picture(10, 10, { x: 2, y: 2, w: 3, h: 3 })
    d[(9 * 10 + 9) * 4 + 3] = 0 // transparent corner pixel is ignored
    expect(contentBox(d, 10, 10)).toEqual({ x: 2, y: 2, w: 3, h: 3 })
  })
  it('only trims when the border is plain white (not a photo of a whole aisle)', () => {
    expect(hasWhiteBorder(picture(40, 40, { x: 10, y: 10, w: 20, h: 20 }), 40, 40)).toBe(true)
    expect(hasWhiteBorder(picture(40, 40, { x: 0, y: 0, w: 40, h: 40 }), 40, 40)).toBe(false)
  })
})

describe('photo records', () => {
  const ok = { data: 'data:image/jpeg;base64,AAA', w: 100, h: 300, source: 'store website', addedAt: '2026-10-15' }
  it('keeps only valid photos', () => {
    const r = cleanPhotos({ '036800083004': ok, bad: ok, '012345678905': { data: 'http://elsewhere/x.png', w: 1, h: 1 } })
    expect(Object.keys(r)).toEqual(['036800083004'])
  })
  it('adds new photos and keeps the newer copy', () => {
    const phone = { '036800083004': { ...ok, addedAt: '2026-10-20', source: 'your photo' } }
    const { merged, added, replaced } = mergePhotos(phone, { '036800083004': ok, '012345678905': ok })
    expect(added).toBe(1)
    expect(replaced).toBe(0)
    expect(merged['036800083004'].source).toBe('your photo')
  })
})
