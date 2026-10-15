import { useMemo } from 'react'
import { Sheet } from './Panels.jsx'
import { changeCount, comparePlans } from '../lib/compare.js'

const spot = (x) => `shelf ${x.shelf} #${x.pos}`
const fac = (x) => `${x.facings}${x.high > 1 ? ` × ${x.high} high` : ''}`

/** What changes from another plan to the open one, e.g. "current" -> "proposed". */
export function CompareSheet({ plan, others, compareId, onCompareId, products, onSelect, onPrint, onClose }) {
  const base = others.find((p) => p.id === compareId) || null
  const c = useMemo(() => (base ? comparePlans(base, plan) : null), [base, plan])
  const name = (x) => products.info(x.item).description
  const List = ({ title, items, line, tap = true }) => (items.length > 0 && (
    <>
      <h3 className="sheet-section">{title} ({items.length})</h3>
      <ul className="item-list">
        {items.map((x) => (
          <li key={x.upc}>
            <button className="row" onClick={tap && x.uid ? () => onSelect(x.uid) : undefined} disabled={!tap || !x.uid}>
              <span className="row-main">
                <span className="row-name">{name(x)}</span>
                <span className="row-sub">{line(x)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  ))
  return (
    <Sheet title="Compare plans" onClose={onClose} tall>
      {!others.length ? (
        <p>Make a copy of this plan first (Plans, then Copy). Then change one and compare them here.</p>
      ) : (
        <>
          <label className="field">
            <span>What changes going from…</span>
            <select className="select" value={compareId || ''} onChange={(e) => onCompareId(e.target.value || null)} data-testid="compare-with">
              <option value="">Pick a plan</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <p className="muted small">…to the plan that is open now: <strong>{plan.name}</strong></p>
          {c && (
            <div data-testid="compare-result">
              <p className="compare-total"><strong>{changeCount(c) ? `${changeCount(c)} change${changeCount(c) > 1 ? 's' : ''}` : 'No changes'}</strong> · {c.same} product{c.same === 1 ? '' : 's'} stay the same</p>
              <button className="btn primary wide" onClick={onPrint} data-testid="print-changes">Print the change list</button>
              <List title="Take out" items={c.removed} tap={false} line={(x) => `was ${spot(x.before)}, ${fac(x.before)} facings${x.toTray ? ' · now off the shelf' : ''}`} />
              <List title="Add" items={c.added} line={(x) => `${spot(x.after)}, ${fac(x.after)} facings`} />
              <List title="Move to another shelf" items={c.movedShelf} line={(x) => `${spot(x.before)} → ${spot(x.after)}`} />
              <List title="Slide along the same shelf" items={c.movedAlong} line={(x) => `${spot(x.before)} → ${spot(x.after)}`} />
              <List title="Change facings" items={c.facings} line={(x) => `${spot(x.after)} · ${fac(x.before)} → ${fac(x.after)} facings`} />
              {c.shelves.length > 0 && (
                <>
                  <h3 className="sheet-section">Shelf changes ({c.shelves.length})</h3>
                  <ul className="plain-list">{c.shelves.map((s) => <li key={s.shelf}>Shelf {s.shelf}: {s.text}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
