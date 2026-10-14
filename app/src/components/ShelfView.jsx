import { useEffect, useRef, useState } from 'react'
import { fmtIn, insertIndexAt } from '../lib/fit.js'

const PAD = 14 // px of space left and right of the shelf
const BOARD = 14 // px thickness of the drawn shelf board
const RULER = 28 // px for the inch ruler under the board
const TOP = 24 // px above everything, for the clearance label
const LONG_PRESS_MS = 380
const MOVE_TOLERANCE = 10 // px a finger may wobble before we decide it is scrolling

/**
 * The shelf, drawn to scale. Products stand on a board, left to right.
 *
 * Moving a product:
 *  - finger: press and hold a product (about half a second), then slide
 *  - mouse: click and drag
 *  - or tap a product, tap "Move", then tap where it should go
 */
export default function ShelfView({
  shelf, fit, products, scale, selectedUid, placing,
  onTapItem, onMove, onPlace, onTapEmpty,
}) {
  const scrollRef = useRef(null)
  const innerRef = useRef(null)
  const drag = useRef(null)
  const [dragView, setDragView] = useState(null)

  const contentIn = Math.max(shelf.widthIn, fit.usedIn) + 3
  const tallestIn = Math.max(shelf.clearanceIn, ...fit.items.map((p) => p.heightIn), 1) + 1.5
  const canvasH = TOP + Math.ceil(tallestIn * scale)
  const width = Math.ceil(PAD * 2 + contentIn * scale)
  const xPx = (inches) => PAD + inches * scale

  // While a product is being dragged, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = scrollRef.current
    const block = (e) => { if (drag.current?.active) e.preventDefault() }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  // Keep the selected product in view.
  useEffect(() => {
    if (!selectedUid || dragView) return
    const p = fit.items.find((i) => i.uid === selectedUid)
    const el = scrollRef.current
    if (!p || !el) return
    const left = xPx(p.xIn)
    const right = xPx(p.xIn + p.widthIn)
    if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, left - el.clientWidth / 3), behavior: 'smooth' })
    }
  }, [selectedUid, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  const inchesAt = (clientX) => {
    const rect = innerRef.current.getBoundingClientRect()
    return (clientX - rect.left - PAD) / scale
  }

  /** Gap index among the OTHER items -> "insert before" index in the full list. */
  const insertBeforeFor = (uid, gap) => {
    const others = shelf.items.filter((i) => i.uid !== uid)
    const target = others[gap]
    return target ? shelf.items.findIndex((i) => i.uid === target.uid) : shelf.items.length
  }

  const startDrag = () => {
    const d = drag.current
    if (!d) return
    d.active = true
    clearTimeout(d.timer)
    navigator.vibrate?.(15)
    const gap = insertIndexAt(fit.items, inchesAt(d.lastX), d.uid)
    setDragView({ uid: d.uid, x: d.lastX - innerRef.current.getBoundingClientRect().left, gap })
  }

  const onPointerDown = (e, uid) => {
    if (placing) return // tap-to-place mode: taps go to the shelf instead
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const mouse = e.pointerType === 'mouse'
    if (mouse) e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      uid, id: e.pointerId, sx: e.clientX, sy: e.clientY, lastX: e.clientX,
      mouse, active: false,
      timer: mouse ? null : setTimeout(startDrag, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    d.lastX = e.clientX
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy)
      if (d.mouse && moved > 5) startDrag()
      else if (!d.mouse && moved > MOVE_TOLERANCE) {
        clearTimeout(d.timer) // the finger is scrolling, not dragging
        drag.current = null
      }
      return
    }
    const el = scrollRef.current
    const r = el.getBoundingClientRect()
    if (e.clientX < r.left + 40) el.scrollLeft -= 10
    else if (e.clientX > r.right - 40) el.scrollLeft += 10
    const gap = insertIndexAt(fit.items, inchesAt(e.clientX), d.uid)
    setDragView({ uid: d.uid, x: e.clientX - innerRef.current.getBoundingClientRect().left, gap })
  }

  const finish = (e, cancelled) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    clearTimeout(d.timer)
    drag.current = null
    if (d.active) {
      if (!cancelled) {
        const gap = insertIndexAt(fit.items, inchesAt(e.clientX), d.uid)
        onMove(d.uid, insertBeforeFor(d.uid, gap))
      }
      setDragView(null)
    } else if (!cancelled) {
      onTapItem(d.uid)
    }
  }

  // Tap-to-place: when "Move" is on, a tap anywhere on the shelf drops the product in the nearest gap.
  const onShelfClick = (e) => {
    if (placing && selectedUid) {
      const gap = insertIndexAt(fit.items, inchesAt(e.clientX), selectedUid)
      onPlace(selectedUid, insertBeforeFor(selectedUid, gap))
    } else if (e.target === e.currentTarget || e.target.dataset.empty) {
      onTapEmpty()
    }
  }

  // Where the drop marker goes: after the widths of the other items before the gap.
  const markerIn = (uid, gap) => {
    let x = 0
    let n = 0
    for (const p of fit.items) {
      if (p.uid === uid) continue
      if (n === gap) break
      x += p.widthIn
      n++
    }
    return x
  }

  const ticks = []
  for (let inch = 0; inch <= shelf.widthIn + 0.001; inch += 6) ticks.push(inch)
  if (ticks[ticks.length - 1] !== shelf.widthIn) ticks.push(shelf.widthIn)

  const byUid = new Map(shelf.items.map((i) => [i.uid, i]))
  const draggingUid = dragView?.uid

  return (
    <div className={`shelf-scroll${placing ? ' placing' : ''}`} ref={scrollRef} data-testid="shelf-scroll">
      <div
        className="shelf-inner"
        ref={innerRef}
        style={{ width, height: canvasH + BOARD + RULER }}
        onClick={onShelfClick}
        data-empty="1"
      >
        {/* back of the shelf, and the space past the right end */}
        <div className="shelf-back" data-empty="1"
          style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH - shelf.clearanceIn * scale, height: shelf.clearanceIn * scale }} />
        {fit.isOver && (
          <div className="shelf-overflow" data-empty="1"
            style={{ left: xPx(shelf.widthIn), width: fit.overIn * scale, top: 0, height: canvasH }} />
        )}
        <div className="clearance-line" data-empty="1"
          style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH - shelf.clearanceIn * scale }}>
          <span>{fmtIn(shelf.clearanceIn)} in clearance</span>
        </div>

        {fit.items.map((p, i) => {
          const item = byUid.get(p.uid)
          const info = products.info(item)
          const dims = products.dims(item)
          const guess = products.isGuess(dims)
          const w = p.widthIn * scale
          const h = p.heightIn * scale
          const showName = w >= 66 && h >= 54
          const classes = ['tile']
          if (guess) classes.push('guess')
          if (p.uid === selectedUid) classes.push('selected')
          if (p.pastEdge) classes.push('past-edge')
          if (p.tooTall) classes.push('too-tall')
          if (p.uid === draggingUid) classes.push('lifted-origin')
          if (!info.inCatalog) classes.push('not-carried')
          return (
            <div
              key={p.uid}
              className={classes.join(' ')}
              data-testid="tile"
              data-uid={p.uid}
              data-pos={i + 1}
              role="button"
              aria-label={`${i + 1}. ${info.description} ${info.size}, ${item.facings} facings`}
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
                  <span key={k} style={{ width: p.unitWidthIn * scale }} />
                ))}
              </div>
              <span className="pos-badge">{i + 1}</span>
              {guess && <span className="guess-mark" aria-label="guessed size">~</span>}
              {showName && <span className="tile-name">{info.description}</span>}
              {(p.tooDeep) && <span className="warn-mark" title="Deeper than the shelf">!</span>}
            </div>
          )
        })}

        {dragView && (() => {
          const p = fit.items.find((i) => i.uid === dragView.uid)
          const info = products.info(byUid.get(dragView.uid))
          const w = p.widthIn * scale
          return (
            <>
              <div className="drop-marker" style={{ left: xPx(markerIn(dragView.uid, dragView.gap)) - 2, top: 0, height: canvasH }} />
              <div className="tile ghost" data-testid="ghost"
                style={{ left: dragView.x - w / 2, width: w, height: p.heightIn * scale, top: canvasH - p.heightIn * scale - 10, '--brand': info.color }}>
                <span className="pos-badge">↔</span>
              </div>
            </>
          )
        })()}

        {/* the shelf board */}
        <div className="board" data-empty="1" style={{ left: xPx(0), width: shelf.widthIn * scale, top: canvasH, height: BOARD }} />
        {/* ruler */}
        <div className="ruler" style={{ top: canvasH + BOARD }}>
          {ticks.map((t) => {
            const major = t === shelf.widthIn || t % 12 === 0
            return (
              <span key={t} className={`tick${major ? ' major' : ''}`} style={{ left: xPx(t) }}>
                {major && <span className="tick-label">{fmtIn(t)}"</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
