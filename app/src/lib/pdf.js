// A tiny PDF maker: each page is one JPEG picture filling the page.
// No library needed; any PDF reader (Files app, Preview, Chrome, printers) can open it.

const enc = new TextEncoder()

/**
 * pages: [{ jpeg: Uint8Array, pxW, pxH, ptW, ptH }]  (pt = 1/72 inch; US Letter = 612 x 792)
 * Returns the PDF file as a Uint8Array.
 */
export function makePdf(pages, { title = 'Shelf plan' } = {}) {
  if (!pages.length) throw new Error('A PDF needs at least one page')
  const chunks = []
  const offsets = [] // byte offset of each object, by object number
  let size = 0
  const put = (x) => {
    const bytes = typeof x === 'string' ? enc.encode(x) : x
    chunks.push(bytes)
    size += bytes.length
  }
  const obj = (n, body) => {
    offsets[n] = size
    put(`${n} 0 obj\n`)
    for (const part of body) put(part)
    put('\nendobj\n')
  }

  // Objects: 1 catalog, 2 page list, 3 info, then 3 per page (page, drawing commands, picture)
  const pageNum = (i) => 4 + i * 3
  put('%PDF-1.4\n%âãÏÓ\n')
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`])
  obj(3, [`<< /Title (${pdfText(title)}) /Producer (Shelf Planner) >>`])
  pages.forEach((p, i) => {
    const n = pageNum(i)
    const w = num(p.ptW)
    const h = num(p.ptH)
    obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`])
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`
    obj(n + 1, [`<< /Length ${enc.encode(draw).length} >>\nstream\n`, draw, '\nendstream'])
    obj(n + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ])
  })
  const count = 4 + pages.length * 3
  const xref = size
  put(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

const num = (x) => String(Math.round(x * 100) / 100)

/** Text inside a PDF string: plain characters only, with ( ) \ escaped. */
export function pdfText(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .slice(0, 200)
}

/** "data:image/jpeg;base64,...." -> bytes */
export function dataUrlBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
