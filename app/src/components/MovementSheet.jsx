import { useState } from 'react'
import { Sheet } from './Panels.jsx'
import { fmtIn } from '../lib/fit.js'
import { paceText } from '../lib/movement.js'

const niceDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

/**
 * Sales help ("worth a look"): uses units sold only. Never changes the plan;
 * tapping a product just shows it on the shelf.
 */
export function MovementSheet({ movement, rows, tips, deliveryDays, onDeliveryDays, onFile, onCsvDays, pendingCsv, onRemove, onSelect, onClose }) {
  const [msg, setMsg] = useState(null)
  const [days, setDays] = useState('')
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setMsg(await onFile(f))
  }
  const Group = ({ title, why, list, line, testid }) => (list.length > 0 && (
    <section className="tips" data-testid={testid}>
      <h3 className="sheet-section">{title} ({list.length})</h3>
      <p className="muted small">{why}</p>
      <ul className="item-list">
        {list.map((r) => (
          <li key={`${testid}-${r.upc}`}>
            <button className="row" onClick={() => onSelect(r.uid)}>
              <span className="row-pos">{r.pos ?? '–'}</span>
              <span className="row-main">
                <span className="row-name">{r.name}</span>
                <span className="row-sub">Shelf {r.shelf} · {line ? line(r) : `${r.facings} facing${r.facings > 1 ? 's' : ''} · ${paceText(r)}`}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ))

  const fileInput = (
    <label className="btn wide file-btn">
      {movement ? 'Load a newer sales file' : 'Load a sales file'}
      <input type="file" accept=".json,.csv,text/csv,application/json" onChange={pick} data-testid="movement-file" />
    </label>
  )

  if (pendingCsv) {
    return (
      <Sheet title="Sales help" onClose={onClose}>
        <p>Read <strong>{Object.keys(pendingCsv.items).length}</strong> products from the “{pendingCsv.columns.units}” column{pendingCsv.skipped ? ` (${pendingCsv.skipped} lines skipped)` : ''}.</p>
        <label className="field">
          <span>How many days of sales does this file cover?</span>
          <div className="field-row">
            <input type="number" inputMode="numeric" min="1" value={days} onChange={(e) => setDays(e.target.value)} data-testid="movement-days" />
            <span className="unit">days</span>
          </div>
          <div className="chips">
            {[[7, '1 week'], [28, '4 weeks'], [91, '13 weeks'], [365, '1 year']].map(([d, label]) => (
              <button key={d} type="button" className={`chip${Number(days) === d ? ' on' : ''}`} onClick={() => setDays(String(d))}>{label}</button>
            ))}
          </div>
        </label>
        <button className="btn primary wide" disabled={!(Number(days) > 0)} onClick={async () => setMsg(await onCsvDays(Number(days)))} data-testid="movement-save">Use this file</button>
      </Sheet>
    )
  }

  return (
    <Sheet title="Sales help" onClose={onClose} tall>
      {!movement ? (
        <>
          <p>See which products may run out, which take a lot of room for what they sell, and what to cut first when a shelf is over.</p>
          <p className="muted small">
            Load a sales movement file: <strong>movement.json</strong> (made from your BRData report) or a CSV export with a UPC column and a units-sold column.
            Only UPC and units sold are read. Sales dollars, cost, margin and on-hand are ignored and never saved.
          </p>
          {fileInput}
        </>
      ) : (
        <>
          <p className="muted small" data-testid="movement-period">
            Sales from {niceDate(movement.from) || '?'} to {niceDate(movement.to) || '?'}
            {movement.days ? ` (${fmtIn(movement.days / 7)} weeks)` : ''} · {Object.keys(movement.items).length.toLocaleString()} products in the file.
            Units sold only.
          </p>
          <div className="field">
            <span>Deliveries come about every</span>
            <div className="chips">
              {[3, 7, 14].map((d) => (
                <button key={d} type="button" className={`chip${deliveryDays === d ? ' on' : ''}`} onClick={() => onDeliveryDays(d)}>{d} days</button>
              ))}
            </div>
          </div>
          <p className="worth-a-look"><strong>Worth a look</strong>, not orders: nothing changes unless you change it. Shelf counts use depths that are mostly still guesses.</p>

          {tips.squeeze.map((sq) => (
            <section className="tips" key={sq.shelfId} data-testid="tips-squeeze">
              <h3 className="sheet-section">Shelf {sq.shelf} is {fmtIn(sq.overIn)} in over</h3>
              {sq.picks.length ? (
                <>
                  <p className="muted small">Giving up one facing of these frees {fmtIn(sq.freed)} in{sq.enough ? ', enough to fit' : ', not quite enough'}. They would still last at least {Math.round(deliveryDays * 1.5)} days.</p>
                  <ul className="item-list">
                    {sq.picks.map((r) => (
                      <li key={r.upc}>
                        <button className="row" onClick={() => onSelect(r.uid)}>
                          <span className="row-pos">{r.pos}</span>
                          <span className="row-main">
                            <span className="row-name">{r.name}</span>
                            <span className="row-sub">{r.facings} → {r.facings - 1} facings frees {fmtIn(r.unitWidth)} in · {paceText(r)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="muted small">No product on it has a facing to spare without running short. Something may have to move or come out.</p>}
            </section>
          ))}
          <Group testid="tips-runout" title="May run out before the next delivery" list={tips.runOut}
            why={`The shelf holds less than about ${Math.round(deliveryDays * 1.5)} days of sales. Another facing may help.`} />
          <Group testid="tips-case" title="A full case won’t fit on the shelf" list={tips.caseWontFit}
            why="Part of each case would go to the back room." line={(r) => `holds ~${r.capacity}, case of ${r.pack} · ${paceText(r)}`} />
          <Group testid="tips-extra" title="Could give up a facing" list={tips.extraFacing}
            why="Even with one facing less, the shelf would hold about 2 months of sales." />
          <Group testid="tips-slowest" title="Slowest for the room they take" list={tips.slowest}
            why="Fewest sold per week for each foot of shelf." line={(r) => `${fmtIn(r.perWeekPerFoot)} a week per foot · ${fmtIn(r.inches)} in of shelf`} />
          <Group testid="tips-nosales" title="No sales in this period" list={tips.noSales} why="Zero units sold in the file’s dates." />
          <Group testid="tips-best" title="Best sellers in this section" list={tips.best} why="Most units sold per week." />
          <Group testid="tips-missing" title="Not in the sales file" list={tips.notInFile}
            why={movement.selectedOnly ? 'This report only listed selected UPCs, so missing does not mean it did not sell.' : 'No line for this UPC in the file.'}
            line={(r) => `${r.facings} facing${r.facings > 1 ? 's' : ''}`} />
          {rows.length === 0 && <p>No products on these shelves yet.</p>}
          <hr />
          {fileInput}
          <button className="btn danger wide" onClick={() => { if (window.confirm('Remove the sales file from this phone?')) onRemove() }}>Remove sales data from this phone</button>
        </>
      )}
      {msg && <p className={/^(Could not|This is not)/.test(msg) ? 'error' : 'ok-msg'} role="status">{msg}</p>}
    </Sheet>
  )
}
