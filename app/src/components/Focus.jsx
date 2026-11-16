// The main screen's pieces, built for one hand in the aisle: a status tag, the products of the shelf you are
// working on (facings right on each row, arrows to move), the ▲/▼ shelf switcher, and the "off the shelf" list.
import { useEffect, useRef } from 'react'
import { AlertTriangle, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ChevronUp, Info, LayoutPanelTop, Minus, Plus, ScanBarcode, Trash2, XCircle } from 'lucide-react'
import { fmtIn } from '../lib/fit.js'
import { positions, shelfLabel } from '../lib/plan.js'
import { sectionOf } from '../lib/aisle.js'
import { sourceMark } from '../lib/sizes.js'
import { Sheet } from './Panels.jsx'
import { niceName, niceSize } from '../lib/text.js'

/** The shelves of the section a shelf belongs to, bottom first (a whole plan, or one section of an aisle). */
export function sectionShelves(plan, shelfId) {
  const sec = plan.sections ? sectionOf(plan, shelfId) : null
  return sec ? sec.shelfIds.map((id) => plan.shelves.find((s) => s.id === id)).filter(Boolean) : plan.shelves
}

/** The shelf above (d = +1) or below (d = -1) in the same section, or null. */
export function neighbourShelf(plan, shelfId, d) {
  const list = sectionShelves(plan, shelfId)
  const i = list.findIndex((s) => s.id === shelfId)
  return list[i + d] || null
}

/** "Shelf 3" (no top/bottom note), with the section letter in an aisle. */
export const shortShelf = (plan, shelfId) => shelfLabel(plan, shelfId).replace(/ \((top|bottom)\)$/, '')

/** One line saying whether the section fits; tap it for the details. */
export function StatusPill({ check, onClick }) {
  const over = check.overCount
  const other = check.tooDeep + check.tooTall
  const tone = over ? 'bad' : other ? 'caution' : 'ok'
  const Icon = over ? XCircle : other ? AlertTriangle : CheckCircle2
  // too tall or too deep is a warning, never dressed up as good news
  const text = over ? `${over} ${over > 1 ? 'shelves' : 'shelf'} over` : other ? `${other} to check` : 'Everything fits'
  return (
    <button className={`status-pill ${tone}`} onClick={onClick} data-testid="status-pill" aria-label={`${text}. Show details`}>
      <Icon size={17} aria-hidden="true" /><span data-testid="section-status">{text}</span>
    </button>
  )
}

const facingsText = (n) => `${n} facing${n > 1 ? 's' : ''}`
const joinParts = (...parts) => parts.filter(Boolean).join(' · ')

/** The products of one shelf, left to right, each with its facings; a tapped row shows its moves. */
export function ShelfRows({ plan, shelf, fit, products, thumbs = {}, selectedUid, onSelect, onFacings, onGapWidth, onMove, onTakeOff, onDetails, onAdd, onScan }) {
  const listRef = useRef(null)
  // an opened row scrolls into view, so its buttons are not hidden under the shelf switcher
  useEffect(() => {
    listRef.current?.querySelector('.frow.open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedUid, shelf.id])
  const posOf = positions(shelf.items)
  const up = neighbourShelf(plan, shelf.id, 1)
  const down = neighbourShelf(plan, shelf.id, -1)
  if (!shelf.items.length) {
    return (
      <div className="empty" data-testid="shelf-empty">
        <p>Nothing on this shelf yet.</p>
        <div className="btn-grid two">
          <button className="btn primary" onClick={onAdd}><Plus size={18} aria-hidden="true" />Add a product</button>
          <button className="btn" onClick={onScan}><ScanBarcode size={18} aria-hidden="true" />Scan one</button>
        </div>
      </div>
    )
  }
  return (
    <ol className="frows" data-testid="shelf-rows" ref={listRef}>
      {shelf.items.map((item, i) => {
        const p = fit.items[i]
        const open = item.uid === selectedUid
        const info = products.info(item)
        const notes = []
        if (p.tooDeep) notes.push('too deep')
        if (p.tooTall) notes.push('too tall')
        if (p.pastEdge) notes.push('past end of shelf')
        if (!p.gap && !info.inCatalog) notes.push('not in store files')
        const thumb = !p.gap && thumbs[item.upc]
        const high = item.high || 1
        const sub = p.gap
          ? `${fmtIn(p.widthIn, 2)} in left open`
          // the facings are on the − + buttons beside it, so they are not repeated here
          : joinParts(niceSize(info.size), `${sourceMark(products.dims(item).source.w)}${fmtIn(p.widthIn)} in wide`, high > 1 && `${high} high`, info.specialOrder && 'special order')
        const gapW = Number(item.widthIn) || 0
        return (
          <li key={item.uid} className={`frow${open ? ' open' : ''}${p.gap ? ' is-gap' : ''}`} data-testid="frow" data-uid={item.uid}>
            <div className="frow-top">
              <button className="frow-main" onClick={() => onSelect(open ? null : item.uid)} aria-expanded={open} data-testid="frow-main">
                <span className="row-pos" style={{ '--brand': info.color }}>{p.gap ? '·' : posOf.get(item.uid)}</span>
                {thumb && <img className="frow-thumb" src={thumb} alt="" />}
                <span className="row-main">
                  <span className="row-name">{p.gap ? info.description : niceName(info.description)}</span>
                  <span className="row-sub">{sub}</span>
                  {notes.length > 0 && <span className="row-warn">{notes.join(' · ')}</span>}
                </span>
              </button>
              {p.gap ? (
                <div className="frow-step" role="group" aria-label="Width of the empty space">
                  <button onClick={() => onGapWidth(item.uid, gapW - 0.5)} disabled={gapW <= 0.5} aria-label="Half an inch narrower"><Minus size={20} aria-hidden="true" /></button>
                  <span><b data-testid="gap-width">{fmtIn(gapW, 2)}</b><small>inches</small></span>
                  <button onClick={() => onGapWidth(item.uid, gapW + 0.5)} aria-label="Half an inch wider"><Plus size={20} aria-hidden="true" /></button>
                </div>
              ) : (
                <div className="frow-step" role="group" aria-label={`Facings of ${info.description}`}>
                  <button onClick={() => onFacings(item.uid, item.facings - 1)} disabled={item.facings <= 1} aria-label="One less facing"><Minus size={20} aria-hidden="true" /></button>
                  <span className="facing-count"><b data-testid="row-facings">{item.facings}</b></span>
                  <button onClick={() => onFacings(item.uid, item.facings + 1)} aria-label="One more facing"><Plus size={20} aria-hidden="true" /></button>
                </div>
              )}
            </div>
            {open && (
              <div className="frow-acts" data-testid="frow-actions">
                <button onClick={() => onMove(item.uid, 'left')} disabled={i === 0} aria-label="Move left"><ArrowLeft size={20} aria-hidden="true" />Left</button>
                <button onClick={() => onMove(item.uid, 'right')} disabled={i === shelf.items.length - 1} aria-label="Move right"><ArrowRight size={20} aria-hidden="true" />Right</button>
                <button onClick={() => onMove(item.uid, 'up')} disabled={!up} aria-label="Move up a shelf"><ArrowUp size={20} aria-hidden="true" />Up</button>
                <button onClick={() => onMove(item.uid, 'down')} disabled={!down} aria-label="Move down a shelf"><ArrowDown size={20} aria-hidden="true" />Down</button>
                {p.gap
                  ? <button className="red" onClick={() => onTakeOff(item.uid)}><Trash2 size={20} aria-hidden="true" />Remove</button>
                  : <button className="red" onClick={() => onTakeOff(item.uid)}><ArrowDownToLine size={20} aria-hidden="true" />Take off</button>}
                {!p.gap && <button onClick={() => onDetails(item.uid)} data-testid="details"><Info size={20} aria-hidden="true" />Details</button>}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Step to the shelf above or below, with the way back to the whole set between them. Only shown on one shelf. */
export function Switcher({ plan, activeShelfId, onStep, onWhole }) {
  const up = neighbourShelf(plan, activeShelfId, 1)
  const down = neighbourShelf(plan, activeShelfId, -1)
  return (
    <div className="switcher" data-testid="switcher">
      <button className="btn" onClick={() => onStep(1)} disabled={!up} data-testid="shelf-up" aria-label={up ? `Go up to ${shortShelf(plan, up.id)}` : 'This is the top shelf'}>
        <ChevronUp size={20} aria-hidden="true" />{up ? shortShelf(plan, up.id) : 'Top'}
      </button>
      <button className="btn" onClick={onWhole} data-testid="whole-set" aria-label="See the whole set">
        <LayoutPanelTop size={20} aria-hidden="true" />Whole set
      </button>
      <button className="btn" onClick={() => onStep(-1)} disabled={!down} data-testid="shelf-down" aria-label={down ? `Go down to ${shortShelf(plan, down.id)}` : 'This is the bottom shelf'}>
        <ChevronDown size={20} aria-hidden="true" />{down ? shortShelf(plan, down.id) : 'Bottom'}
      </button>
    </div>
  )
}

/** Products taken off, or that AFI left out of the set: put one on the shelf you are on, or delete it. */
export function TraySheet({ plan, products, thumbs = {}, targetLabel, onPut, onDelete, onClose }) {
  return (
    <Sheet title={`Off the shelf (${plan.tray.length})`} onClose={onClose}>
      <p className="muted small">Products you took off, or that AFI left out of the set.</p>
      {!plan.tray.length && <p className="empty">Nothing is off the shelf.</p>}
      <ol className="frows" data-testid="tray">
        {plan.tray.map((item) => {
          const info = products.info(item)
          const thumb = thumbs[item.upc]
          return (
            <li key={item.uid} className="frow" data-testid="tray-row">
              <div className="frow-top">
                <div className="frow-main static">
                  {thumb && <img className="frow-thumb" src={thumb} alt="" />}
                  <span className="row-main">
                    <span className="row-name">{niceName(info.description)}</span>
                    <span className="row-sub">{joinParts(niceSize(info.size), facingsText(item.facings))}</span>
                    {!info.inCatalog && <span className="row-warn">not in store files</span>}
                  </span>
                </div>
              </div>
              <div className="tray-acts">
                <button className="btn primary" onClick={() => onPut(item.uid)} aria-label={`Put on ${targetLabel}: ${info.description}`}>Put on {targetLabel}</button>
                <button className="btn danger" onClick={() => onDelete(item.uid)} aria-label={`Delete ${info.description}`}><Trash2 size={18} aria-hidden="true" /></button>
              </div>
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}
