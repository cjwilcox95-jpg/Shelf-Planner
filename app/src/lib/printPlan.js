// Print / save a plan: a drawing of the section to scale, and a product list with check boxes,
// laid out on US Letter pages. Pages are drawn on a canvas, then saved as a PDF (pdf.js) or a picture.
// The layout math is plain functions (tested in printPlan.test.js); the drawing needs a browser.

import { fmtIn } from './fit.js'
import { positions, shelfLabel } from './plan.js'
import { prettyUpc } from './upc.js'
import { sourceMark } from './sizes.js'
import { dataUrlBytes, makePdf } from './pdf.js'

export const DPI = 200 // canvas pixels per page inch
export const PORTRAIT = { w: 8.5, h: 11, name: 'portrait' }
export const LANDSCAPE = { w: 11, h: 8.5, name: 'landscape' }
const MARGIN = 0.4 // page inches
const LABEL_COL = 1.1 // page inches for the shelf labels left of the drawing
const HEADER = 0.85
const FOOTER = 0.55
const RULER = 0.3
const SHELF_GAP = 0.1 // page inches between shelves
export const BOARD_IN = 1.25 // shelf board thickness drawn, in real inches
const INK = '#1d2329'
const MUTED = '#5b6168'
const DANGER = '#b3261e'
const FONT = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'

const sum = (a) => a.reduce((n, x) => n + x, 0)

/** Height each shelf needs, in real inches: its clearance, or a taller product. */
export function shelfHeights(plan, check) {
  return plan.shelves.map((s) => Math.max(s.clearanceIn, ...check.byShelf[s.id].items.map((p) => p.heightIn)))
}

/**
 * Portrait or landscape, whichever draws the section bigger.
 * Returns { page, s } where s = page inches per real inch.
 */
export function drawingLayout(plan, check) {
  const widest = check.widestIn + 1
  const tall = sum(shelfHeights(plan, check)) + plan.shelves.length * BOARD_IN
  const fixed = HEADER + FOOTER + RULER + plan.shelves.length * SHELF_GAP + 2 * MARGIN
  const options = [PORTRAIT, LANDSCAPE].map((page) => ({
    page,
    s: Math.min((page.w - 2 * MARGIN - LABEL_COL) / widest, (page.h - fixed) / tall),
  }))
  return options[0].s >= options[1].s ? options[0] : options[1]
}

/** Split table rows into pages, never leaving a shelf heading alone at the bottom of a page. */
export function paginate(rows, perPage) {
  const pages = []
  let cur = []
  rows.forEach((r, i) => {
    const lastSlot = cur.length === perPage - 1
    if (cur.length >= perPage || (lastSlot && r.type === 'heading' && rows[i + 1])) {
      pages.push(cur)
      cur = []
    }
    cur.push(r)
  })
  if (cur.length) pages.push(cur)
  return pages
}

/** Rows for the product list, top shelf first, then the "off the shelf" tray. */
export function listRows(plan, check, products) {
  const rows = []
  for (const shelf of [...plan.shelves].reverse()) {
    const fit = check.byShelf[shelf.id]
    rows.push({
      type: 'heading',
      text: shelfLabel(plan, shelf.id),
      right: `${fmtIn(fit.usedIn)} of ${fmtIn(shelf.widthIn)} in · ${fit.isOver ? `${fmtIn(fit.overIn)} in OVER` : `${fmtIn(fit.remainingIn)} in left`} · clearance ${fmtIn(shelf.clearanceIn)} in · ${fmtIn(shelf.depthIn)} in deep`,
      warn: fit.isOver,
    })
    if (!shelf.items.length) rows.push({ type: 'note', text: 'Empty shelf' })
    const posOf = positions(shelf.items)
    shelf.items.forEach((item, i) => {
      const p = fit.items[i]
      if (p.gap) { rows.push({ type: 'note', text: `Empty space, ${fmtIn(p.widthIn, 2)} in` }); return }
      rows.push(itemRow(item, posOf.get(item.uid), p, products))
    })
  }
  if (plan.tray.length) {
    rows.push({ type: 'heading', text: 'Off the shelf (not in the set)', right: `${plan.tray.length} products` })
    for (const item of plan.tray) rows.push(itemRow(item, '–', null, products))
  }
  return rows
}

function itemRow(item, pos, p, products) {
  const info = products.info(item)
  const d = products.dims(item)
  const notes = []
  if (p?.high > 1) notes.push(`${p.high} high`)
  if (p?.tooTall) notes.push('too tall')
  if (p?.tooDeep) notes.push('too deep')
  if (p?.pastEdge) notes.push('past end')
  if (!info.inCatalog) notes.push('not in store files')
  if (info.specialOrder) notes.push('special order')
  return {
    type: 'item',
    check: true,
    cells: [
      String(pos),
      info.description,
      info.size || '',
      info.inCatalog ? prettyUpc(info.upc) : '',
      String(item.facings),
      p ? `${sourceMark(d.source.w)}${fmtIn(p.widthIn)}` : '',
      notes.join(', '),
    ],
    warn: !!(p && (p.tooTall || p.tooDeep || p.pastEdge)),
  }
}

export const LIST_COLUMNS = [
  { label: '#', w: 0.35 },
  { label: 'Product', w: 2.55 },
  { label: 'Size', w: 0.85 },
  { label: 'UPC', w: 1.4 },
  { label: 'Facings', w: 0.6, right: true },
  { label: 'Width in', w: 0.7, right: true },
  { label: 'Notes', w: 0.95 },
]

// ---------------------------------------------------------------- drawing (browser only)

const px = (inches) => Math.round(inches * DPI)

function newPage(page) {
  const canvas = document.createElement('canvas')
  canvas.width = px(page.w)
  canvas.height = px(page.h)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

const font = (ctx, sizeIn, weight = 400, style = '') => { ctx.font = `${style} ${weight} ${px(sizeIn)}px ${FONT}` }

/** Shorten text with … so it fits maxW pixels. */
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo ? `${text.slice(0, lo)}…` : ''
}

/** Wrap text into lines of at most maxW pixels. */
function wrap(ctx, text, maxW) {
  const lines = []
  let line = ''
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxW || !line) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

function header(ctx, page, title, sub, pageNo, pageCount, date) {
  const x = px(MARGIN)
  font(ctx, 0.2, 700)
  ctx.fillStyle = INK
  ctx.fillText(fit(ctx, title, px(page.w - 2 * MARGIN - 1.6)), x, px(MARGIN + 0.22))
  font(ctx, 0.11)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(`Page ${pageNo} of ${pageCount}`, px(page.w - MARGIN), px(MARGIN + 0.2))
  ctx.fillText(date, px(page.w - MARGIN), px(MARGIN + 0.38))
  ctx.textAlign = 'left'
  font(ctx, 0.125)
  ctx.fillText(fit(ctx, sub, px(page.w - 2 * MARGIN - 1.6)), x, px(MARGIN + 0.45))
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, px(MARGIN + 0.6))
  ctx.lineTo(px(page.w - MARGIN), px(MARGIN + 0.6))
  ctx.stroke()
}

function footer(ctx, page, text) {
  font(ctx, 0.1)
  ctx.fillStyle = MUTED
  ctx.fillText(fit(ctx, text, px(page.w - 2 * MARGIN)), px(MARGIN), px(page.h - MARGIN + 0.05))
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

/** photos: { upc: picture URL } (or null for no photos). */
async function drawSection(ctx, page, s, plan, check, products, photos) {
  const S = s * DPI // pixels per real inch
  const left = px(MARGIN + LABEL_COL)
  const heights = shelfHeights(plan, check)
  const imgs = new Map()
  for (const shelf of plan.shelves) {
    for (const item of shelf.items) {
      const src = photos?.[item.upc]
      if (src && !imgs.has(item.upc)) imgs.set(item.upc, await loadImage(src))
    }
  }
  let y = px(MARGIN + HEADER)
  const top = [...plan.shelves].reverse()
  const topH = [...heights].reverse()
  top.forEach((shelf, k) => {
    const fitS = check.byShelf[shelf.id]
    const hIn = topH[k]
    const floor = y + hIn * S // top of the board
    const posOf = positions(shelf.items)
    // clearance area
    ctx.fillStyle = '#f1eee8'
    ctx.fillRect(left, floor - shelf.clearanceIn * S, shelf.widthIn * S, shelf.clearanceIn * S)
    if (fitS.isOver) {
      ctx.fillStyle = 'rgba(179, 38, 30, 0.14)'
      ctx.fillRect(left + shelf.widthIn * S, y, fitS.overIn * S, floor - y)
    }
    // products
    fitS.items.forEach((p, i) => {
      const item = shelf.items[i]
      const x0 = left + p.xIn * S
      const w = p.widthIn * S
      if (p.gap) {
        ctx.setLineDash([px(0.03), px(0.025)])
        ctx.strokeStyle = MUTED
        ctx.lineWidth = 2
        ctx.strokeRect(x0 + 1, floor - shelf.clearanceIn * S * 0.5, w - 2, shelf.clearanceIn * S * 0.5)
        ctx.setLineDash([])
        return
      }
      const h = p.heightIn * S
      const info = products.info(item)
      const d = products.dims(item)
      const guess = products.isGuess(d)
      const img = imgs.get(item.upc)
      ctx.fillStyle = p.pastEdge ? '#fbe3e1' : '#fff'
      ctx.fillRect(x0, floor - h, w, h)
      const uw = p.unitWidthIn * S
      const uh = p.unitHeightIn * S
      for (let f = 0; f < item.facings; f++) {
        for (let k2 = 0; k2 < p.high; k2++) {
          const ux = x0 + f * uw
          const uy = floor - (k2 + 1) * uh
          if (img) {
            const r = Math.min(uw / img.width, uh / img.height)
            const iw = img.width * r
            const ih = img.height * r
            ctx.drawImage(img, ux + (uw - iw) / 2, uy + uh - ih, iw, ih)
          }
          ctx.strokeStyle = '#c6c0b5'
          ctx.lineWidth = 1
          ctx.strokeRect(ux, uy, uw, uh)
        }
      }
      ctx.strokeStyle = p.pastEdge || p.tooTall ? DANGER : INK
      ctx.lineWidth = 3
      if (guess) ctx.setLineDash([px(0.035), px(0.025)])
      ctx.strokeRect(x0 + 1.5, floor - h + 1.5, w - 3, h - 3)
      ctx.setLineDash([])
      // name, written up the tile when there is no photo
      if (!img && w > px(0.09) && h > px(0.35)) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0, floor - h, w, h)
        ctx.clip()
        ctx.translate(x0 + w / 2, floor - px(0.05))
        ctx.rotate(-Math.PI / 2)
        const size = Math.min(0.1, (w / DPI) * 0.55)
        font(ctx, size, 600)
        ctx.fillStyle = INK
        ctx.textBaseline = 'middle'
        ctx.fillText(fit(ctx, info.description, h - px(0.32)), 0, 0)
        ctx.restore()
      }
      // position number
      const r = px(Math.min(0.075, Math.max(0.05, w / DPI / 2.2)))
      const cx = x0 + w / 2
      const cy = floor - h + r + px(0.03)
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      font(ctx, (r / DPI) * 1.15, 700)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(posOf.get(item.uid)), cx, cy + 1)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      if (guess || d.source.w === 'photo') {
        font(ctx, 0.1, 800)
        ctx.fillStyle = MUTED
        ctx.textAlign = 'right'
        ctx.fillText(guess ? '~' : '≈', x0 + w - px(0.02), floor - px(0.03))
        ctx.textAlign = 'left'
      }
    })
    // board
    ctx.fillStyle = '#5c6670'
    ctx.fillRect(left, floor, shelf.widthIn * S, BOARD_IN * S)
    // label
    const lx = px(MARGIN)
    let ly = y + px(0.16)
    font(ctx, 0.12, 700)
    ctx.fillStyle = INK
    ctx.fillText(fit(ctx, shelfLabel(plan, shelf.id).replace(' (', ' ('), px(LABEL_COL - 0.08)), lx, ly)
    font(ctx, 0.105)
    ly += px(0.17)
    ctx.fillStyle = MUTED
    ctx.fillText(`${fmtIn(fitS.usedIn)} of ${fmtIn(shelf.widthIn)} in`, lx, ly)
    ly += px(0.16)
    ctx.fillStyle = fitS.isOver ? DANGER : INK
    font(ctx, 0.105, 700)
    ctx.fillText(fitS.isOver ? `${fmtIn(fitS.overIn)} in OVER` : `${fmtIn(fitS.remainingIn)} in left`, lx, ly)
    font(ctx, 0.105)
    ly += px(0.16)
    ctx.fillStyle = MUTED
    if (ly < floor + BOARD_IN * S) ctx.fillText(`clear ${fmtIn(shelf.clearanceIn)} in`, lx, ly)
    drawKey(ctx, page, shelf, posOf, products, left + (check.widestIn + 1) * S + px(0.25), y, floor + BOARD_IN * S)
    y = floor + BOARD_IN * S + px(SHELF_GAP)
  })
  // ruler
  const widest = Math.max(...plan.shelves.map((x) => x.widthIn))
  ctx.strokeStyle = MUTED
  ctx.fillStyle = MUTED
  ctx.lineWidth = 2
  font(ctx, 0.095)
  ctx.textAlign = 'center'
  for (let inch = 0; inch <= widest + 0.001; inch += 6) {
    const x = left + inch * S
    const major = inch % 12 === 0
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + px(major ? 0.08 : 0.05))
    ctx.stroke()
    if (major) ctx.fillText(`${inch}″`, x, y + px(0.2))
  }
  ctx.textAlign = 'left'
  return y + px(RULER)
}

/** Names beside each shelf, when the page has room to the right of the drawing. */
function drawKey(ctx, page, shelf, posOf, products, x, top, bottom) {
  const width = px(page.w - MARGIN) - x
  if (width < px(1.5)) return
  const items = shelf.items.filter((i) => i.kind !== 'gap')
  if (!items.length) return
  const lineH = px(0.125)
  const rows = Math.max(1, Math.floor((bottom - top) / lineH))
  const cols = items.length > rows && width >= px(3.2) ? 2 : 1
  const colW = width / cols
  const room = rows * cols
  font(ctx, 0.095)
  items.forEach((item, k) => {
    if (k >= room) return
    const col = Math.floor(k / rows)
    const cx = x + col * colW
    const cy = top + (k % rows) * lineH + px(0.1)
    if (k === room - 1 && items.length > room) {
      ctx.fillStyle = MUTED
      ctx.fillText(`+${items.length - room + 1} more on the list`, cx, cy)
      return
    }
    const info = products.info(item)
    font(ctx, 0.095, 700)
    ctx.fillStyle = INK
    const n = `${posOf.get(item.uid)}`
    ctx.fillText(n, cx, cy)
    font(ctx, 0.095)
    const sizeShown = info.size && !info.description.replace(/\s/g, '').includes(info.size.replace(/\s/g, ''))
    const text = `${info.description}${sizeShown ? ` ${info.size}` : ''}${item.facings > 1 ? ` ×${item.facings}` : ''}`
    ctx.fillText(fit(ctx, text, colW - px(0.3)), cx + px(0.22), cy)
  })
}

function drawTable(ctx, page, rows, columns, startY) {
  const x0 = px(MARGIN)
  const rowH = px(0.215)
  const totalW = px(page.w - 2 * MARGIN)
  const checkW = px(0.3)
  let y = startY
  // column titles
  font(ctx, 0.1, 700)
  ctx.fillStyle = MUTED
  let cx = x0 + checkW
  for (const c of columns) {
    ctx.textAlign = c.right ? 'right' : 'left'
    ctx.fillText(c.label, c.right ? cx + px(c.w) - px(0.08) : cx, y + px(0.14))
    cx += px(c.w)
  }
  ctx.textAlign = 'left'
  y += rowH
  for (const r of rows) {
    if (r.type === 'heading') {
      ctx.fillStyle = '#e8e4dc'
      ctx.fillRect(x0, y + 2, totalW, rowH - 2)
      font(ctx, 0.115, 700)
      ctx.fillStyle = INK
      const t = fit(ctx, r.text, px(2.4))
      ctx.fillText(t, x0 + px(0.06), y + px(0.155))
      font(ctx, 0.1, r.warn ? 700 : 400)
      ctx.fillStyle = r.warn ? DANGER : MUTED
      ctx.textAlign = 'right'
      ctx.fillText(fit(ctx, r.right || '', totalW - ctx.measureText(t).width - px(0.4)), x0 + totalW - px(0.06), y + px(0.155))
      ctx.textAlign = 'left'
    } else if (r.type === 'note') {
      font(ctx, 0.105, 400, 'italic')
      ctx.fillStyle = MUTED
      ctx.fillText(fit(ctx, r.text, totalW - checkW), x0 + checkW, y + px(0.15))
    } else {
      if (r.check) {
        ctx.strokeStyle = INK
        ctx.lineWidth = 2
        ctx.strokeRect(x0 + px(0.04), y + px(0.04), px(0.14), px(0.14))
      }
      let x = x0 + checkW
      r.cells.forEach((cell, i) => {
        const c = columns[i]
        const isNote = i === r.cells.length - 1
        font(ctx, 0.105, i === 0 ? 700 : 400)
        ctx.fillStyle = isNote && r.warn ? DANGER : INK
        const t = fit(ctx, cell, px(c.w) - px(0.08))
        ctx.textAlign = c.right ? 'right' : 'left'
        ctx.fillText(t, c.right ? x + px(c.w) - px(0.08) : x, y + px(0.15))
        x += px(c.w)
      })
      ctx.textAlign = 'left'
      ctx.strokeStyle = '#ddd8cf'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, y + rowH)
      ctx.lineTo(x0 + totalW, y + rowH)
      ctx.stroke()
    }
    y += rowH
  }
  return y
}

// table starts below the header; one row is the column titles; stop above the footer
const ROWS_PER_PAGE = Math.floor((PORTRAIT.h - MARGIN - 0.35 - (MARGIN + HEADER - 0.1) - 0.215) / 0.215)

/**
 * Draw every page. Returns [{ canvas, page }]. photos: { upc: picture URL }.
 * opts: { drawing, list, usePhotos, extraTables: [{ title, columns, rows }], date }
 */
export async function renderPages(plan, check, products, photos, opts = {}) {
  const { drawing = true, list = true, usePhotos = true, extraTables = [], date = new Date().toLocaleDateString() } = opts
  const productCount = sum(plan.shelves.map((s) => s.items.filter((i) => i.kind !== 'gap').length))
  const extras = [check.tooTall && `${check.tooTall} too tall`, check.tooDeep && `${check.tooDeep} too deep`].filter(Boolean)
  const width = check.overCount ? `${check.overCount} ${check.overCount > 1 ? 'shelves' : 'shelf'} over` : extras.length ? 'width fits' : 'everything fits'
  const status = [width, ...extras].join(' · ')
  const sub = `${plan.shelves.length} shelves · ${productCount} products · ${status}`
  const legend = 'Sizes: ~ = guessed, ≈ = estimated, no mark = measured or from the AFI planogram. Numbers count left to right on each shelf.'
  const plans = [] // what to draw, page by page
  if (drawing) plans.push({ kind: 'drawing', ...drawingLayout(plan, check) })
  const tables = []
  if (list) tables.push({ title: 'Products, shelf by shelf (top shelf first)', columns: LIST_COLUMNS, rows: listRows(plan, check, products) })
  tables.push(...extraTables)
  for (const t of tables) {
    for (const rows of paginate(t.rows, ROWS_PER_PAGE)) plans.push({ kind: 'table', page: PORTRAIT, table: t, rows })
  }
  const out = []
  for (const [n, p] of plans.entries()) {
    const { canvas, ctx } = newPage(p.page)
    if (p.kind === 'drawing') {
      header(ctx, p.page, plan.name, sub, n + 1, plans.length, date)
      const end = await drawSection(ctx, p.page, p.s, plan, check, products, usePhotos ? photos : null)
      if (plan.note) {
        font(ctx, 0.1)
        ctx.fillStyle = MUTED
        const lines = wrap(ctx, plan.note, px(p.page.w - 2 * MARGIN))
        const room = Math.floor((px(p.page.h - MARGIN - 0.2) - end) / px(0.15))
        lines.slice(0, Math.max(0, room)).forEach((l, i) => ctx.fillText(l, px(MARGIN), end + px(0.12) + i * px(0.15)))
      }
      footer(ctx, p.page, legend)
    } else {
      header(ctx, p.page, plan.name, p.table.title, n + 1, plans.length, date)
      drawTable(ctx, p.page, p.rows, p.table.columns, px(MARGIN + HEADER - 0.1))
      footer(ctx, p.page, `${legend} Tick each box as you set the product.`)
    }
    // Turn each page into JPEG bytes right away and free its canvas (phones limit canvas memory);
    // only the first page's canvas is kept, for the preview and the picture.
    const jpeg = dataUrlBytes(canvas.toDataURL('image/jpeg', 0.88))
    if (jpeg.length < 1000) throw new Error('the phone ran out of memory drawing the pages; try fewer pages')
    out.push({ canvas: n === 0 ? canvas : null, page: p.page, jpeg, pxW: canvas.width, pxH: canvas.height })
    if (n > 0) { canvas.width = 0; canvas.height = 0 }
  }
  return out
}

/** All pages as one PDF file (Blob). */
export function pagesToPdf(pages, title) {
  const pdfPages = pages.map(({ jpeg, pxW, pxH, page }) => ({ jpeg, pxW, pxH, ptW: page.w * 72, ptH: page.h * 72 }))
  return new Blob([makePdf(pdfPages, { title })], { type: 'application/pdf' })
}

/** One page as a PNG picture (Blob). */
export const pageToPng = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

/** A file name from the plan name: "laundry-a-tide-2026-10-15.pdf" */
export function printFileName(plan, ext, now = new Date()) {
  const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plan'
  return `${slug}-${now.toISOString().slice(0, 10)}.${ext}`
}
