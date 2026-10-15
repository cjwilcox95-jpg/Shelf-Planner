import { useEffect, useRef, useState } from 'react'
import { fmtIn, insertIndexAt } from '../lib/fit.js'
import { shelfLabel } from '../lib/plan.js'

const PAD = 14 // px left and right of the shelves
const BOARD = 12 // px thickness of each drawn shelf board
const TOP = 10 // px of air above the tallest product on each shelf
const LONG_PRESS_MS = 380
const MOVE_TOLERANCE = 10 // px a finger may wobble before we decide it is scrolling

/**
 * The whole section, drawn to one scale. Top shelf first, like standing in front of it.
 *
 * Moving a product (also between shelves):
 *  - finger: press and hold a product about half a second, then slide
 *  - mouse: click and drag
 *  - or tap a product, tap "Move", then tap where it should go
 */
export default function SectionView({
  plan, fits, products, photos = {}, scale, viewWidth, selectedUid, activeShelfId, placing,
  onTapItem, onMove, onTapShelf,
}) {
  const scrollRef = useRef(null)
  const canvasRefs = useRef({})
  const drag = useRef(null)
  const [dragView, setDragView] = useState(null)

  const widestIn = Math.max(...plan.shelves.map((s) => Math.max(s.widthIn, fits[s.id].usedIn)))
  const width = Math.ceil(PAD * 2 + (widestIn + 3) * scale)
  const xPx = (inches) => PAD + inches * scale
  const topFirst = [...plan.shelves].reverse()

  // While dragging, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = scrollRef.current
    const block = (e) => { if (drag.current?.active) e.preventDefault() }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  // Bring the selected product into view (sideways and up/down).
  useEffect(() => {
    if (!selectedUid || dragView) return
    const el = scrollRef.current?.querySelector(`[data-uid="${selectedUid}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedUid, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Which shelf is the finger over, and how far along it (inches)? */
  const locate = (clientX, clientY) => {
    let best = null
    for (const s of plan.shelves) {
      const el = canvasRefs.current[s.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const dist = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0
      if (!best || dist < best.dist) best = { shelf: s, dist, xIn: (clientX - r.left - PAD) / scale }
    }
    return best
  }

  /** Gap among the OTHER items -> "insert before" index in that shelf's list. */
  const insertBeforeFor = (shelf, uid, gap) => {
    const others = shelf.items.filter((i) => i.uid !== uid)
    const target = others[gap]
    return target ? shelf.items.findIndex((i) => i.uid === target.uid) : shelf.items.length
  }

  const viewAt = (uid, clientX, clientY) => {
    const at = locate(clientX, clientY)
    const gap = insertIndexAt(fits[at.shelf.id].items, at.xIn, uid)
    return { uid, shelfId: at.shelf.id, gap, clientX, clientY }
  }

  const startDrag = () => {
    const d = drag.current
    if (!d) return
    d.active = true
    clearTimeout(d.timer)
    navigator.vibrate?.(15)
    setDragView(viewAt(d.uid, d.lastX, d.lastY))
  }

  const onPointerDown = (e, uid) => {
    if (placing) return // in tap-to-place mode a tap goes to the shelf
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const mouse = e.pointerType === 'mouse'
    if (mouse) e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      uid, id: e.pointerId, sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY,
      mouse, active: false, timer: mouse ? null : setTimeout(startDrag, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    d.lastX = e.clientX
    d.lastY = e.clientY
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy)
      if (d.mouse && moved > 5) startDrag()
      else if (!d.mouse && moved > MOVE_TOLERANCE) {
        clearTimeout(d.timer) // the finger is scrolling, not dragging
        drag.current = null
      }
      return
    }
    // Scroll along when the finger nears an edge.
    const el = scrollRef.current
    const r = el.getBoundingClientRect()
    if (e.clientX < r.left + 40) el.scrollLeft -= 10
    else if (e.clientX > r.right - 40) el.scrollLeft += 10
    if (e.clientY < 90) window.scrollBy(0, -12)
    else if (e.clientY > window.innerHeight - 170) window.scrollBy(0, 12)
    setDragView(viewAt(d.uid, e.clientX, e.clientY))
  }

  const finish = (e, cancelled) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    clearTimeout(d.timer)
    drag.current = null
    if (d.active) {
      if (!cancelled) {
        const v = viewAt(d.uid, e.clientX, e.clientY)
        const shelf = plan.shelves.find((s) => s.id === v.shelfId)
        onMove(d.uid, v.shelfId, insertBeforeFor(shelf, d.uid, v.gap))
      }
      setDragView(null)
    } else if (!cancelled) {
      const shelfId = plan.shelves.find((s) => s.items.some((i) => i.uid === d.uid))?.id
      onTapItem(d.uid, shelfId)
    }
  }

  const onCanvasClick = (e, shelf) => {
    if (placing && selectedUid) {
      const r = canvasRefs.current[shelf.id].getBoundingClientRect()
      const gap = insertIndexAt(fits[shelf.id].items, (e.clientX - r.left - PAD) / scale, selectedUid)
      onMove(selectedUid, shelf.id, insertBeforeFor(shelf, selectedUid, gap))
    } else {
      onTapShelf(shelf.id)
    }
  }

  // Tapping a shelf's heading: in Move mode, put the product at the right end of that shelf.
  const onHeadClick = (shelf) => {
    if (placing && selectedUid) onMove(selectedUid, shelf.id, shelf.items.length)
    else onTapShelf(shelf.id)
  }

  const markerIn = (shelfFit, uid, gap) => {
    let x = 0
    let n = 0
    for (const p of shelfFit.items) {
      if (p.uid === uid) continue
      if (n === gap) break
      x += p.widthIn
      n++
    }
    return x
  }

  const rulerIn = Math.max(...plan.shelves.map((s) => s.widthIn))
  const ticks = []
  for (let inch = 0; inch <= rulerIn + 0.001; inch += 6) ticks.push(inch)
  if (ticks[ticks.length - 1] !== rulerIn) ticks.push(rulerIn)

  return (
    <>
      <div className={`section-scroll${placing ? ' placing' : ''}`} ref={scrollRef} data-testid="section-scroll">
        <div className="section-inner" style={{ width }}>
          {topFirst.map((shelf) => {
            const fit = fits[shelf.id]
            const tallestIn = Math.max(shelf.clearanceIn, ...fit.items.map((p) => p.heightIn), 1)
            const canvasH = TOP + Math.ceil(tallestIn * scale)
            const byUid = new Map(shelf.items.map((i) => [i.uid, i]))
            const isTarget = dragView?.shelfId === shelf.id
            const pct = Math.min(100, fit.percentUsed)
            return (
              <div key={shelf.id} className={`shelf-row${shelf.id === activeShelfId ? ' active' : ''}`} data-testid="shelf-row" data-shelf={shelf.id}>
                <button
                  type="button"
                  className={`shelf-head${fit.isOver ? ' over' : ''}`}
                  style={{ width: viewWidth, '--used': `calc((100% - 20px) * ${pct / 100})` }}
                  onClick={(e) => { e.stopPropagation(); onHeadClick(shelf) }}
                  data-testid="shelf-head"
                >
                  <span className="shelf-head-name">{shelfLabel(plan, shelf.id)}</span>
                  <span className="shelf-head-nums">
                    {fmtIn(fit.usedIn)} of {fmtIn(shelf.widthIn)} ·{' '}
                    <strong data-testid="shelf-left">{fit.isOver ? `${fmtIn(fit.overIn)} in OVER` : `${fmtIn(fit.remainingIn)} in left`}</strong>
                  </span>
                </button>
                <div
                  className="shelf-canvas"
                  ref={(el) => { canvasRefs.current[shelf.id] = el }}
                  style={{ height: canvasH + BOARD }}
                  onClick={(e) => onCanvasClick(e, shelf)}
                >
                  <div className="shelf-back" style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH - shelf.clearanceIn * scale, height: shelf.clearanceIn * scale }} />
                  {fit.isOver && <div className="shelf-overflow" style={{ left: xPx(shelf.widthIn), width: fit.overIn * scale, top: 0, height: canvasH }} />}
                  <div className="clearance-line" style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH - shelf.clearanceIn * scale }} />

                  {fit.items.map((p, i) => {
                    const item = byUid.get(p.uid)
                    const info = products.info(item)
                    const guess = products.isGuess(products.dims(item))
                    const w = p.widthIn * scale
                    const h = p.heightIn * scale
                    const lines = Math.min(3, Math.floor((h - 34) / 16.5))
                    const photo = photos[item.upc]
                    const classes = ['tile']
                    if (photo) classes.push('has-photo')
                    if (guess) classes.push('guess')
                    if (p.uid === selectedUid) classes.push('selected')
                    if (p.pastEdge) classes.push('past-edge')
                    if (p.tooTall) classes.push('too-tall')
                    if (p.uid === dragView?.uid) classes.push('lifted-origin')
                    if (!info.inCatalog) classes.push('not-carried')
                    return (
                      <div
                        key={p.uid}
                        className={classes.join(' ')}
                        data-testid="tile"
                        data-uid={p.uid}
                        role="button"
                        aria-label={`${shelfLabel(plan, shelf.id)}, position ${i + 1}: ${info.description} ${info.size}, ${item.facings} facings`}
                        style={{ left: xPx(p.xIn), width: w, height: h, top: canvasH - h, '--brand': info.color }}
                        onPointerDown={(e) => onPointerDown(e, p.uid)}
                        onPointerMove={onPointerMove}
                        onPointerUp={(e) => finish(e, false)}
                        onPointerCancel={(e) => finish(e, true)}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => { if (!placing) e.stopPropagation() }}
                      >
                        <div className="units">
                          {Array.from({ length: item.facings }, (_, k) => (
                            <span key={k} style={{ width: p.unitWidthIn * scale }}>
                              {photo && <img src={photo.data} alt="" draggable="false" />}
                            </span>
                          ))}
                        </div>
                        <span className="pos-badge">{i + 1}</span>
                        {guess && <span className="guess-mark" aria-label="guessed size">~</span>}
                        {!photo && w >= 66 && lines >= 1 && (
                          <span className="tile-name" style={{ WebkitLineClamp: lines }}>{info.description}</span>
                        )}
                        {p.tooDeep && <span className="warn-mark" title="Deeper than the shelf">!</span>}
                      </div>
                    )
                  })}

                  {isTarget && (
                    <div className="drop-marker" style={{ left: xPx(markerIn(fit, dragView.uid, dragView.gap)) - 2, top: 0, height: canvasH }} />
                  )}
                  <div className="board" style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH, height: BOARD }} />
                </div>
              </div>
            )
          })}
          <div className="ruler">
            {ticks.map((t) => {
              const major = t === rulerIn || t % 12 === 0
              return (
                <span key={t} className={`tick${major ? ' major' : ''}`} style={{ left: xPx(t) }}>
                  {major && <span className="tick-label">{fmtIn(t)}"</span>}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {dragView && (() => {
        const shelf = plan.shelves.find((s) => s.items.some((i) => i.uid === dragView.uid))
        const p = fits[shelf.id].items.find((i) => i.uid === dragView.uid)
        const info = products.info(shelf.items.find((i) => i.uid === dragView.uid))
        const w = p.widthIn * scale
        const h = p.heightIn * scale
        return (
          <div className="tile ghost" data-testid="ghost"
            style={{ position: 'fixed', left: dragView.clientX - w / 2, top: dragView.clientY - h - 12, width: w, height: h, '--brand': info.color }}>
            <span className="pos-badge">↕</span>
          </div>
        )
      })()}
    </>
  )
}
