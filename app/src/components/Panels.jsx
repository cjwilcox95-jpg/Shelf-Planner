import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtIn } from '../lib/fit.js'
import { search } from '../lib/search.js'
import { prettyUpc } from '../lib/upc.js'

/** Inches used / available, and what is left or over. */
export function Summary({ shelf, fit, anyGuess, warnings }) {
  const pct = Math.min(100, fit.percentUsed)
  const overPct = fit.isOver ? Math.min(100, (fit.overIn / shelf.widthIn) * 100) : 0
  return (
    <section className={`summary${fit.isOver ? ' over' : ''}`} aria-live="polite" data-testid="summary">
      <div className="summary-main">
        <div>
          <div className="big">{fmtIn(fit.usedIn)}<span className="unit"> in</span></div>
          <div className="sub">used of {fmtIn(shelf.widthIn)} in</div>
        </div>
        <div className="summary-right" data-testid="left-or-over">
          {fit.isOver
            ? <><div className="big">{fmtIn(fit.overIn)}<span className="unit"> in</span></div><div className="sub strong">OVER</div></>
            : <><div className="big">{fmtIn(fit.remainingIn)}<span className="unit"> in</span></div><div className="sub">left</div></>}
        </div>
      </div>
      <div className="bar" role="img" aria-label={`${Math.round(fit.percentUsed)} percent used`}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        {fit.isOver && <div className="bar-over" style={{ width: `${overPct}%` }} />}
      </div>
      {(warnings.length > 0 || anyGuess) && (
        <ul className="summary-notes">
          {warnings.map((w) => <li key={w} className="warn">{w}</li>)}
          {anyGuess && <li>~ Sizes marked ~ are guesses, not measurements.</li>}
        </ul>
      )}
    </section>
  )
}

/** The selected product: facings, move, remove. */
export function SelectedPanel({ item, info, placed, dims, position, placing, clearanceIn, onFacings, onStartPlace, onCancelPlace, onRemove, onClose }) {
  const guess = (k) => (dims.source[k] === 'guess' ? '~' : '')
  return (
    <section className="selected" data-testid="selected-panel">
      <div className="selected-head">
        <div>
          <div className="selected-name">{position}. {info.description}</div>
          <div className="muted">{info.size}{info.pack ? ` · pack ${info.pack}` : ''} · <span className="nowrap">UPC {prettyUpc(info.upc)}</span></div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {placing ? (
        <div className="placing-hint">
          <strong>Tap the shelf where it should go.</strong>
          <button className="btn" onClick={onCancelPlace}>Cancel move</button>
        </div>
      ) : (
        <div className="selected-actions">
          <div className="stepper" aria-label="Facings">
            <button className="btn step" onClick={() => onFacings(item.facings - 1)} disabled={item.facings <= 1} aria-label="One less facing">−</button>
            <div className="step-value"><span data-testid="facings">{item.facings}</span><small>facings</small></div>
            <button className="btn step" onClick={() => onFacings(item.facings + 1)} aria-label="One more facing">+</button>
          </div>
          <button className="btn" onClick={onStartPlace}>Move</button>
          <button className="btn danger" onClick={onRemove}>Remove</button>
        </div>
      )}
      <dl className="facts">
        <div><dt>Width on shelf</dt><dd>{item.facings} × {guess('w')}{fmtIn(dims.w, 2)} in = <strong>{guess('w')}{fmtIn(placed.widthIn)} in</strong></dd></div>
        <div><dt>Size each</dt><dd>{guess('w')}{fmtIn(dims.w, 2)} W × {guess('h')}{fmtIn(dims.h, 2)} H × {guess('d')}{fmtIn(dims.d, 2)} D in</dd></div>
        <div><dt>Front to back</dt><dd>{placed.tooDeep ? <span className="warn">Deeper than the shelf</span> : `about ${placed.unitsDeep} deep (${placed.capacity} on shelf)`}</dd></div>
        {placed.tooTall && <div><dt>Height</dt><dd className="warn">{guess('h')}{fmtIn(dims.h, 2)} in tall; clearance is {fmtIn(clearanceIn)} in</dd></div>}
        {!info.inCatalog && <div><dt>Store</dt><dd className="warn">Not in your store's item files</dd></div>}
        {info.specialOrder && <div><dt>Store</dt><dd>KEHE special order</dd></div>}
      </dl>
      {dims.source.w === 'guess' && <p className="muted small">Size guessed from {dims.basis}. Real measurements come in the next stage.</p>}
    </section>
  )
}

/** Every product on the shelf, left to right. Tap to select. */
export function ItemList({ shelf, fit, products, selectedUid, onSelect }) {
  if (!shelf.items.length) {
    return <p className="empty">This shelf is empty. Tap <strong>Add product</strong> to start.</p>
  }
  return (
    <ol className="item-list" data-testid="item-list">
      {shelf.items.map((item, i) => {
        const info = products.info(item)
        const p = fit.items[i]
        const guess = products.isGuess(products.dims(item))
        const notes = []
        if (p.tooDeep) notes.push('too deep')
        if (p.tooTall) notes.push('too tall')
        if (p.pastEdge) notes.push('past end of shelf')
        if (!info.inCatalog) notes.push('not in store files')
        return (
          <li key={item.uid}>
            <button className={`row${item.uid === selectedUid ? ' selected' : ''}`} onClick={() => onSelect(item.uid)}>
              <span className="row-pos" style={{ '--brand': info.color }}>{i + 1}</span>
              <span className="row-main">
                <span className="row-name">{info.description}</span>
                <span className="row-sub">
                  {info.size} · {item.facings} facing{item.facings > 1 ? 's' : ''} · {guess ? '~' : ''}{fmtIn(p.widthIn)} in
                  {info.specialOrder ? ' · special order' : ''}
                </span>
                {notes.length > 0 && <span className="row-warn">{notes.join(' · ')}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** A panel that slides up from the bottom of the screen. */
export function Sheet({ title, onClose, children, tall }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Search the catalog by name or UPC and add to the shelf. */
export function AddSheet({ index, catalog, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const results = useMemo(() => search(index, q), [index, q])
  const sub = catalog.subclassNames || {}
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <Sheet title="Add product" onClose={onClose} tall>
      <input
        ref={inputRef}
        className="search"
        type="search"
        inputMode="search"
        placeholder="Name or UPC, e.g. heinz ketchup 20"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search products"
        data-testid="search-input"
      />
      {q.trim() && !results.length && <p className="empty">No products match “{q}”.</p>}
      {!q.trim() && <p className="muted">Type part of a name (any order: “ketchup hnz”) or the digits of a UPC.</p>}
      <ul className="results">
        {results.map((p) => (
          <li key={p.upc}>
            <div className="result-main">
              <div className="row-name">{p.description}</div>
              <div className="row-sub">
                {p.size}{p.pack ? ` · pack ${p.pack}` : ''} · {sub[`${p.classCode}-${p.subclassCode}`] || ''}
                {p.aisle ? ` · ${p.aisle}` : ''}
              </div>
              <div className="row-sub">UPC {prettyUpc(p.upc)}
                {p.specialOrder && <span className="tag">special order</span>}
                {p.display && <span className="tag">pallet/display</span>}
              </div>
            </div>
            <button className="btn primary" onClick={() => onAdd(p)} data-testid="add-result">Add</button>
          </li>
        ))}
      </ul>
      {results.length === 60 && <p className="muted">Showing the first 60. Add more words to narrow it down.</p>}
    </Sheet>
  )
}

/** Shelf width, depth, clearance, name. */
export function ShelfSheet({ shelf, catalog, onSave, onClose, onReplaceData }) {
  const [form, setForm] = useState({
    name: shelf.name, widthIn: shelf.widthIn, depthIn: shelf.depthIn, clearanceIn: shelf.clearanceIn,
  })
  const num = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const valid = ['widthIn', 'depthIn', 'clearanceIn'].every((k) => Number(form[k]) > 0 && Number(form[k]) <= 600)
  const save = () => {
    onSave({ name: form.name.trim() || 'My shelf', widthIn: Number(form.widthIn), depthIn: Number(form.depthIn), clearanceIn: Number(form.clearanceIn) })
    onClose()
  }
  const field = (k, label, chips) => (
    <label className="field">
      <span>{label}</span>
      <div className="field-row">
        <input type="number" inputMode="decimal" step="0.25" min="1" value={form[k]} onChange={num(k)} />
        <span className="unit">in</span>
      </div>
      <div className="chips">
        {chips.map((c) => (
          <button type="button" key={c} className={`chip${Number(form[k]) === c ? ' on' : ''}`} onClick={() => setForm({ ...form, [k]: c })}>{c}</button>
        ))}
      </div>
    </label>
  )
  return (
    <Sheet title="Shelf size" onClose={onClose}>
      <label className="field">
        <span>Name</span>
        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      {field('widthIn', 'Width', [36, 48, 96])}
      {field('depthIn', 'Depth (front to back)', [16, 20, 24])}
      {field('clearanceIn', 'Clearance (room above the shelf)', [10, 12, 14, 16])}
      {shelf.note && <p className="muted">{shelf.note}</p>}
      <button className="btn primary wide" onClick={save} disabled={!valid}>Save shelf size</button>
      <hr />
      <p className="muted small">
        Store data: {catalog.items.length.toLocaleString()} products, built {catalog.built}.
      </p>
      <button className="btn wide" onClick={onReplaceData}>Load a newer store-data file</button>
    </Sheet>
  )
}

/** Pick an AFI reset and one of its shelves to start from. */
export function AfiSheet({ resets, products, onLoad, onClose }) {
  const [open, setOpen] = useState(resets[0]?.id)
  return (
    <Sheet title="Start from an AFI reset" onClose={onClose} tall>
      <p className="muted">Loads one shelf of an old AFI planogram, with AFI's facings, onto your shelf. You can undo it.</p>
      {resets.map((r) => (
        <div key={r.id} className="afi-set">
          <button className={`afi-head${open === r.id ? ' open' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span><strong>{r.name}</strong><br /><span className="muted">{r.widthFt} ft · {r.shelves.length} shelves · AFI {r.date}</span></span>
            <span aria-hidden="true">{open === r.id ? '▾' : '▸'}</span>
          </button>
          {open === r.id && (
            <ul className="afi-shelves">
              {[...r.shelves].reverse().map((s) => {
                const facings = s.items.reduce((a, i) => a + i.facings, 0)
                const missing = s.items.filter((i) => i.status === 'notFound').length
                return (
                  <li key={s.shelf}>
                    <button className="row" onClick={() => onLoad(r, s)} data-testid={`afi-${r.id}-shelf-${s.shelf}`}>
                      <span className="row-pos">{s.shelf}</span>
                      <span className="row-main">
                        <span className="row-name">Shelf {s.shelf}{s.shelf === 1 ? ' (bottom)' : s.shelf === r.shelves.length ? ' (top)' : ''}</span>
                        <span className="row-sub">{s.items.length} items · {facings} facings · {s.items.slice(0, 3).map((i) => products.info(i).description).join(', ')}{s.items.length > 3 ? '…' : ''}</span>
                        {missing > 0 && <span className="row-warn">{missing} not in store files</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </Sheet>
  )
}
