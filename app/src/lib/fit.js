// Fit math: everything is in real inches. Pure functions, unit-tested in fit.test.js.

const EPS = 1e-6

/** Inches a shelf item takes up: product width x number of facings. */
export function itemWidth(widthIn, facings) {
  if (!(widthIn > 0) || !(facings > 0)) return 0
  return widthIn * facings
}

/** How many units fit front to back. 0 when the product is deeper than the shelf. */
export function unitsDeep(shelfDepthIn, productDepthIn) {
  if (!(productDepthIn > 0) || !(shelfDepthIn > 0)) return 0
  return Math.floor(shelfDepthIn / productDepthIn + EPS)
}

/**
 * Check one shelf.
 * shelf: { widthIn, depthIn, clearanceIn, items: [{ uid, facings }] }
 * dimsOf(item) -> { w, h, d } in inches (numbers)
 * Returns totals, a left-to-right position for every item, and warnings.
 */
export function checkShelf(shelf, dimsOf) {
  let x = 0
  const items = shelf.items.map((item) => {
    const dims = dimsOf(item)
    const width = itemWidth(dims.w, item.facings)
    const placed = {
      uid: item.uid,
      xIn: x,
      widthIn: width,
      unitWidthIn: dims.w,
      heightIn: dims.h,
      depthIn: dims.d,
      unitsDeep: unitsDeep(shelf.depthIn, dims.d),
      tooDeep: dims.d > shelf.depthIn + EPS,
      tooTall: dims.h > shelf.clearanceIn + EPS,
      // starts (or ends) past the right edge of the shelf
      pastEdge: x + width > shelf.widthIn + EPS,
    }
    placed.capacity = placed.unitsDeep * item.facings
    x += width
    return placed
  })
  const usedIn = x
  const remainingIn = shelf.widthIn - usedIn
  return {
    items,
    usedIn,
    availableIn: shelf.widthIn,
    remainingIn: Math.max(0, remainingIn),
    overIn: Math.max(0, -remainingIn),
    isOver: remainingIn < -EPS,
    percentUsed: shelf.widthIn > 0 ? (usedIn / shelf.widthIn) * 100 : 0,
  }
}

/** Index to insert at, given a pointer position in inches along the shelf. */
export function insertIndexAt(placedItems, xIn, skipUid) {
  let index = 0
  for (const p of placedItems) {
    if (p.uid === skipUid) continue
    if (xIn > p.xIn + p.widthIn / 2) index++
  }
  return index
}

/** Round for display: 4.5, 12, 0.3. Avoids "-0" and floating-point noise. */
export function fmtIn(x, places = 1) {
  const f = 10 ** places
  const r = Math.round((x + Number.EPSILON) * f) / f
  return String(Object.is(r, -0) ? 0 : r)
}
