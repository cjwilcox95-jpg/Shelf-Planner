import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtIn } from '../lib/fit.js'
import { search } from '../lib/search.js'
import { prettyUpc } from '../lib/upc.js'
import { shelfLabel, TRAY } from '../lib/plan.js'
import { sourceMark, SOURCE_LABEL } from '../lib/sizes.js'

const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** The whole section at a glance. */
export function SectionSummary({ plan, check, anyGuess, missing }) {
  const notes = []
  if (check.tooDeep) notes.push(`${check.tooDeep} product${check.tooDeep > 1 ? 's' : ''} too deep for the shelf`)
  if (check.tooTall) notes.push(`${check.tooTall} product${check.tooTall > 1 ? 's' : ''} taller than the clearance`)
  if (missing) notes.push(`${missing} not in your store's item files`)
  const over = check.overCount
  const otherProblems = check.tooDeep + check.tooTall
  let status = 'Everything fits'
  if (over) status = `${over} shelf${over > 1 ? 's' : ''} over`
  else if (otherProblems) status = 'Width fits'
  return (
    <section className={`summary${over ? ' over' : otherProblems ? ' caution' : ''}`} aria-live="polite" data-testid="summary">
      <div className="summary-main">
        <div>
          <div className="big" data-testid="section-status">{status}</div>
          <div className="sub">
            {plan.shelves.length} shelves · {plan.shelves.reduce((n, s) => n + s.items.length, 0)} products
            {plan.tray.length ? ` · ${plan.tray.length} off the shelf` : ''}
          </div>
        </div>
      </div>
      {(notes.length > 0 || anyGuess) && (
        <p className="summary-notes">
          {notes.map((w) => <span key={w} className="warn">{w}</span>)}
          {anyGuess && <span>~ = guessed size · ≈ = from photo</span>}
        </p>
      )}
    </section>
  )
}

/** The selected product, pinned above the bottom buttons so it is always in reach. */
export function SelectedBar({ plan, where, index, item, info, placed, dims, placing, photo, onEditSize, onPickPhoto, onRemovePhoto, onFacings, onStartPlace, onCancelPlace, onTakeOff, onDelete, onClose }) {
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    await onPickPhoto(f)
    setBusy(false)
  }
  const inTray = where === TRAY
  const g = (k) => sourceMark(dims.source[k])
  const place = inTray ? 'Off the shelf' : `${shelfLabel(plan, where)}, #${index + 1}`
  if (placing) {
    // Keep the bar small so the shelves stay visible while you pick a spot.
    return (
      <section className="selected-bar compact" data-testid="selected-panel" aria-label="Moving a product">
        <div className="placing-hint">
          <div className="placing-text">
            <strong>Tap a shelf where it should go.</strong>
            <span className="muted small">Moving {info.description}</span>
          </div>
          <button className="btn" onClick={onCancelPlace}>Cancel</button>
        </div>
      </section>
    )
  }
  return (
    <section className="selected-bar" data-testid="selected-panel" aria-label="Selected product">
      <div className="selected-head">
        <label className={`photo-slot${photo ? ' has-photo' : ''}`} aria-label={photo ? 'Change photo' : 'Add photo'}>
          {photo ? <img src={photo.data} alt="" /> : <span>{busy ? '…' : '＋\nPhoto'}</span>}
          <input type="file" accept="image/*" onChange={pick} data-testid="photo-input" />
        </label>
        <div className="selected-text">
          <div className="muted small">{place}</div>
          <div className="selected-name">{info.description}</div>
          <div className="muted small">{info.size}{info.pack ? ` · pack ${info.pack}` : ''} · <span className="nowrap">UPC {prettyUpc(info.upc)}</span></div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="selected-actions">
          <div className="stepper" aria-label="Facings">
            <button className="btn step" onClick={() => onFacings(item.facings - 1)} disabled={item.facings <= 1} aria-label="One less facing">−</button>
            <div className="step-value"><span data-testid="facings">{item.facings}</span><small>facings</small></div>
            <button className="btn step" onClick={() => onFacings(item.facings + 1)} aria-label="One more facing">+</button>
          </div>
          <button className="btn" onClick={onStartPlace}>{inTray ? 'Put on shelf' : 'Move'}</button>
          {inTray
            ? <button className="btn danger" onClick={onDelete}>Delete</button>
            : <button className="btn danger" onClick={onTakeOff}>Take off</button>}
      </div>
      {placed && (
        <p className="selected-facts">
          {item.facings} × {g('w')}{fmtIn(dims.w, 2)} in = <strong>{g('w')}{fmtIn(placed.widthIn)} in wide</strong>
          {' · '}{placed.tooDeep ? <span className="warn">deeper than the shelf</span> : `about ${placed.unitsDeep} deep`}
          {placed.tooTall && <> · <span className="warn">too tall</span></>}
          {!info.inCatalog && <> · <span className="warn">not in store files</span></>}
          {' '}<button className="link-btn" onClick={onEditSize} data-testid="edit-size">Edit size</button>
          <button className="link-btn" onClick={() => setMore(!more)}>{more ? 'Less' : 'More'}</button>
        </p>
      )}
      {more && (
        <dl className="facts">
          <div><dt>Size each</dt><dd>{g('w')}{fmtIn(dims.w, 2)} W × {g('h')}{fmtIn(dims.h, 2)} H × {g('d')}{fmtIn(dims.d, 2)} D in</dd></div>
          <div><dt>Where from</dt><dd>W {SOURCE_LABEL[dims.source.w]} · H {SOURCE_LABEL[dims.source.h]} · D {SOURCE_LABEL[dims.source.d]}</dd></div>
          {dims.note && <div><dt>Notes</dt><dd>{dims.note}</dd></div>}
          {placed && <div><dt>On the shelf</dt><dd>{placed.tooDeep ? 'won’t fit front to back' : `${placed.capacity} units (${item.facings} wide × ${placed.unitsDeep} deep)`}</dd></div>}
          {info.specialOrder && <div><dt>Store</dt><dd>KEHE special order</dd></div>}
          {dims.source.w === 'guess' && <div><dt>Guess</dt><dd>from {dims.basis}</dd></div>}
          <div><dt>Photo</dt><dd>
            {photo
              ? <>{photo.source}{' '}<button className="link-btn" onClick={onRemovePhoto}>Remove photo</button></>
              : 'none yet: tap the ＋ Photo square'}
          </dd></div>
        </dl>
      )}
    </section>
  )
}

function Row({ item, position, info, sub, warn, selected, onSelect, photo }) {
  return (
    <li>
      <button className={`row${selected ? ' selected' : ''}`} onClick={onSelect}>
        <span className="row-pos" style={{ '--brand': info.color }}>{position}</span>
        {photo && <img className="row-thumb" src={photo.data} alt="" />}
        <span className="row-main">
          <span className="row-name">{info.description}</span>
          <span className="row-sub">{sub}</span>
          {warn && <span className="row-warn">{warn}</span>}
        </span>
      </button>
    </li>
  )
}

/** Every product, shelf by shelf from the top, then the tray. */
export function SectionList({ plan, fits, products, photos = {}, selectedUid, onSelect }) {
  const topFirst = [...plan.shelves].reverse()
  return (
    <div data-testid="item-list">
      {plan.tray.length > 0 && (
        <section className="tray" data-testid="tray">
          <h2 className="list-title">Off the shelf ({plan.tray.length})</h2>
          <p className="muted small">Products you took off, or that AFI left out of the set. Tap one, then “Put on shelf”.</p>
          <ol className="item-list">
            {plan.tray.map((item) => {
              const info = products.info(item)
              return (
                <Row key={item.uid} item={item} position="–" info={info} photo={photos[item.upc]}
                  sub={`${info.size} · ${item.facings} facing${item.facings > 1 ? 's' : ''}`}
                  warn={!info.inCatalog ? 'not in store files' : ''}
                  selected={item.uid === selectedUid} onSelect={() => onSelect(item.uid, TRAY)} />
              )
            })}
          </ol>
        </section>
      )}
      {topFirst.map((shelf) => {
        const fit = fits[shelf.id]
        return (
          <section key={shelf.id}>
            <h2 className="list-title">
              {shelfLabel(plan, shelf.id)}
              <span className={`list-title-nums${fit.isOver ? ' warn' : ''}`}>
                {fit.isOver ? `${fmtIn(fit.overIn)} in over` : `${fmtIn(fit.remainingIn)} in left`}
              </span>
            </h2>
            {!shelf.items.length && <p className="empty small">Empty shelf.</p>}
            <ol className="item-list">
              {shelf.items.map((item, i) => {
                const info = products.info(item)
                const p = fit.items[i]
                const mark = sourceMark(products.dims(item).source.w)
                const notes = []
                if (p.tooDeep) notes.push('too deep')
                if (p.tooTall) notes.push('too tall')
                if (p.pastEdge) notes.push('past end of shelf')
                if (!info.inCatalog) notes.push('not in store files')
                return (
                  <Row key={item.uid} item={item} position={i + 1} info={info} photo={photos[item.upc]}
                    sub={`${info.size} · ${item.facings} facing${item.facings > 1 ? 's' : ''} · ${mark}${fmtIn(p.widthIn)} in${info.specialOrder ? ' · special order' : ''}`}
                    warn={notes.join(' · ')}
                    selected={item.uid === selectedUid} onSelect={() => onSelect(item.uid, shelf.id)} />
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
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

/** Search the catalog by name or UPC and add to a shelf. */
export function AddSheet({ index, catalog, targetLabel, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const results = useMemo(() => search(index, q), [index, q])
  const sub = catalog.subclassNames || {}
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <Sheet title={`Add to ${targetLabel}`} onClose={onClose} tall>
      <input
        ref={inputRef} className="search" type="search" inputMode="search"
        placeholder="Name or UPC, e.g. heinz ketchup 20"
        value={q} onChange={(e) => setQ(e.target.value)}
        aria-label="Search products" data-testid="search-input"
      />
      {q.trim() && !results.length && <p className="empty">No products match “{q}”.</p>}
      {!q.trim() && <p className="muted">Type part of a name (any order: “ketchup hnz”) or the digits of a UPC. To add to a different shelf, close this and tap that shelf first.</p>}
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

/** Size of one shelf (or all of them), and adding/removing shelves. */
export function ShelfSheet({ plan, shelf, catalog, onSave, onAddShelf, onRemoveShelf, onClose, onReplaceData, onOpenGuesses }) {
  const [form, setForm] = useState({ widthIn: shelf.widthIn, depthIn: shelf.depthIn, clearanceIn: shelf.clearanceIn })
  const [all, setAll] = useState(false)
  const valid = ['widthIn', 'depthIn', 'clearanceIn'].every((k) => Number(form[k]) > 0 && Number(form[k]) <= 600)
  const save = () => {
    onSave({ widthIn: Number(form.widthIn), depthIn: Number(form.depthIn), clearanceIn: Number(form.clearanceIn) }, all)
    onClose()
  }
  const field = (k, label, chips) => (
    <label className="field">
      <span>{label}</span>
      <div className="field-row">
        <input type="number" inputMode="decimal" step="0.25" min="1" value={form[k]}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`field-${k}`} />
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
    <Sheet title={`${shelfLabel(plan, shelf.id)} size`} onClose={onClose}>
      {field('widthIn', 'Width', [36, 48, 96])}
      {field('depthIn', 'Depth (front to back)', [16, 20, 24])}
      {field('clearanceIn', 'Clearance (room above the shelf)', [8, 10, 12, 14, 16])}
      {shelf.afiDepthIn && <p className="muted small">AFI planned this shelf {shelf.afiDepthIn} in deep.</p>}
      <label className="check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span>Use these sizes for every shelf in this section</span>
      </label>
      <button className="btn primary wide" onClick={save} disabled={!valid}>Save</button>
      <hr />
      <div className="btn-grid">
        <button className="btn" onClick={() => { onAddShelf('top'); onClose() }}>Add a shelf on top</button>
        <button className="btn" onClick={() => { onAddShelf('bottom'); onClose() }}>Add a shelf at bottom</button>
        <button className="btn danger" disabled={plan.shelves.length <= 1}
          onClick={() => { onRemoveShelf(shelf.id); onClose() }}>Remove this shelf</button>
      </div>
      <p className="muted small">Removing a shelf moves its products to “Off the shelf”. You can undo.</p>
      <hr />
      <button className="btn wide" onClick={onOpenGuesses} data-testid="open-guesses">Default size guesses…</button>
      <p className="muted small">Store data: {catalog.items.length.toLocaleString()} products, built {catalog.built}.</p>
      <button className="btn wide" onClick={onReplaceData}>Load a newer store-data file</button>
    </Sheet>
  )
}

/** All saved plans: open, copy, rename, delete, start new, back up. */
export function PlansSheet({
  plans, currentId, resets, lastBackupAt, onOpen, onDuplicate, onRename, onDelete,
  onNewBlank, onNewAfi, onExport, onImportFile, onClose,
}) {
  const [renaming, setRenaming] = useState(null)
  const [name, setName] = useState('')
  const [blank, setBlank] = useState({ shelves: 5, widthIn: 48 })
  const [msg, setMsg] = useState(null)
  const list = Object.values(plans).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setMsg(await onImportFile(f))
  }
  return (
    <Sheet title="Plans" onClose={onClose} tall>
      <h3 className="sheet-section">Your plans</h3>
      <ul className="plan-list" data-testid="plan-list">
        {list.map((p) => (
          <li key={p.id} className={p.id === currentId ? 'current' : ''}>
            {renaming === p.id ? (
              <form className="rename" onSubmit={(e) => { e.preventDefault(); onRename(p.id, name.trim() || p.name); setRenaming(null) }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Plan name" />
                <button className="btn primary">Save</button>
              </form>
            ) : (
              <div className="plan-name">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.id === currentId ? 'Open now · ' : ''}{p.shelves.length} shelves · changed {shortDate(p.updatedAt)}
                </span>
              </div>
            )}
            <div className="plan-btns">
              {p.id !== currentId && <button className="btn primary" onClick={() => onOpen(p.id)}>Open</button>}
              <button className="btn" onClick={() => onDuplicate(p.id)}>Copy</button>
              <button className="btn" onClick={() => { setRenaming(p.id); setName(p.name) }}>Rename</button>
              <button className="btn danger" onClick={() => onDelete(p.id)} aria-label={`Delete ${p.name}`}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Tip: “Copy” a plan to keep the current set and try a proposed one next to it.</p>

      <h3 className="sheet-section">New plan</h3>
      <div className="new-blank">
        <div>
          <span className="field-label">Shelves</span>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} type="button" className={`chip${blank.shelves === n ? ' on' : ''}`} onClick={() => setBlank({ ...blank, shelves: n })}>{n}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">Width</span>
          <div className="chips">
            {[36, 48, 96].map((w) => (
              <button key={w} type="button" className={`chip${blank.widthIn === w ? ' on' : ''}`} onClick={() => setBlank({ ...blank, widthIn: w })}>{w} in</button>
            ))}
          </div>
        </div>
        <button className="btn primary wide" onClick={() => onNewBlank(blank)}>Start an empty section</button>
      </div>

      <h3 className="sheet-section">Start from an AFI reset</h3>
      <p className="muted small">Copies a whole AFI section, every shelf with AFI's facings, into a new plan.</p>
      <ul className="item-list">
        {resets.map((r) => (
          <li key={r.id}>
            <button className="row" onClick={() => onNewAfi(r)} data-testid={`afi-${r.id}`}>
              <span className="row-main">
                <span className="row-name">{r.name}</span>
                <span className="row-sub">{r.widthFt} ft · {r.shelves.length} shelves · AFI {r.date}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="sheet-section">Backup</h3>
      <p className="muted small">
        One file with all your plans and the store data. Save it to Files (or email it to yourself).
        Photos and sizes are included. Use it to move to a new phone. Last backup: <strong>{lastBackupAt ? shortDate(lastBackupAt) : 'never'}</strong>.
      </p>
      <button className="btn primary wide" onClick={async () => setMsg(await onExport())} data-testid="export-backup">Export backup</button>
      <label className="btn wide file-btn">
        Import backup, photo/size pack or catalog file
        <input type="file" accept=".json,application/json" onChange={pick} data-testid="import-file" />
      </label>
      {msg && <p className={msg.startsWith('Could not') || msg.startsWith('This is not') ? 'error' : 'ok-msg'} role="status">{msg}</p>}
    </Sheet>
  )
}
