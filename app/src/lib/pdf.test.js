import { describe, it, expect } from 'vitest'
import { makePdf, pdfText, dataUrlBytes } from './pdf.js'

const fakeJpeg = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256) // any bytes, incl. "endstream"-free noise
const text = (bytes) => new TextDecoder('latin1').decode(bytes)

describe('makePdf', () => {
  const pages = [
    { jpeg: fakeJpeg(500), pxW: 1700, pxH: 2200, ptW: 612, ptH: 792 },
    { jpeg: fakeJpeg(321), pxW: 2200, pxH: 1700, ptW: 792, ptH: 612 },
  ]
  const pdf = makePdf(pages, { title: 'Laundry (A) 50%' })
  const s = text(pdf)

  it('starts and ends like a PDF', () => {
    expect(s.startsWith('%PDF-1.4\n')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('has one page per picture, each with its own size', () => {
    expect(s).toContain('/Count 2')
    expect(s).toContain('/MediaBox [0 0 612 792]')
    expect(s).toContain('/MediaBox [0 0 792 612]')
    expect(s).toContain('/Width 1700 /Height 2200')
    expect(s).toContain('/Length 500')
    expect(s).toContain('/Length 321')
  })

  it('the table of contents points at every object exactly', () => {
    const startxref = Number(s.match(/startxref\n(\d+)\n%%EOF/)[1])
    expect(s.slice(startxref, startxref + 4)).toBe('xref')
    const [, count] = s.slice(startxref).match(/xref\n0 (\d+)\n/)
    const entries = s.slice(startxref).split('\n').slice(3, 2 + Number(count))
    expect(entries).toHaveLength(Number(count) - 1)
    entries.forEach((e, i) => {
      expect(e).toMatch(/^\d{10} 00000 n $/)
      const at = Number(e.slice(0, 10))
      expect(s.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('escapes the title', () => {
    expect(s).toContain('/Title (Laundry \\(A\\) 50%)')
    expect(pdfText('Café “new”')).toBe('Cafe new')
  })

  it('refuses an empty PDF', () => {
    expect(() => makePdf([])).toThrow()
  })
})

describe('dataUrlBytes', () => {
  it('decodes base64', () => {
    expect([...dataUrlBytes('data:image/jpeg;base64,AAEC/w==')]).toEqual([0, 1, 2, 255])
  })
})
