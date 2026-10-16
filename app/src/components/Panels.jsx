import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtIn } from '../lib/fit.js'
import { search } from '../lib/search.js'
import { prettyUpc } from '../lib/upc.js'
import { positions, shelfLabel, TRAY } from '../lib/plan.js'
import { LETTERS } from '../lib/aisle.js'
import { sourceMark, SOURCE_LABEL } from '../lib/sizes.js'

const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** The whole section at a glance. */
export function SectionSummary({ plan, check, anyGuess, missing, productCount }) {
  const notes = []
  if (check.tooDeep) notes.push(`${check.tooDeep} product${check.tooDeep > 1 ? 's' : ''} too deep for the shelf`)
  if (check.tooTall) notes.push(`${check.tooTall} product${check.tooTall > 1 ? 's' : ''} taller than the clearance`)
  if (missing) notes.push(`${missing} not in your store's item files`)
  const over = check.overCount
  const otherProblems = check.tooDeep + check.tooTall
  let status = 'Everything fits'
  if (over) status = `${over} ${over > 1 ? 'shelves' : 'shelf'} over`
  else if (otherProblems) status = 'Width fits'
  return (
    <section className={`summary${over ? ' over' : otherProblems ? ' caution' : ''}`} aria-live="polite" data-testid="summary">
      <div className="summary-main">
        <div>
          <div className="big" data-testid="section-status">{status}</div>
          <div className="sub">
            {plan.sections ? `${plan.sections.length} sections · ` : ''}{plan.shelves.length} shelves · {productCount} products
            {plan.tray.length ? ` · ${plan.tray.length} off the shelf` : ''}
          </div>
        </div>
      </div>
      {plan.sections && (
        <p className="summary-notes aisle-key" data-testid="aisle-key">
          {plan.sections.map((s) => <span key={s.planId}><strong>{s.letter}</strong> {s.name}</span>)}
        </p>
      )}
      {(notes.length > 0 || anyGuess) && (
        <p className="summary-notes">
          {notes.map((w) => <span key={w} className="warn">{w}</span>)}
          {anyGuess && <span>~ = guessed size · ≈ = estimated</span>}
        </p>
      )}
    </section>
  )
}

/** The selected product, pinned above the bottom buttons so it is always in reach. */
export function SelectedBar({ plan, where, index, item, info, placed, dims, placing, photo, movement, onEditSize, onPickPhoto, onRemovePhoto, onFacings, onHigh, onGapWidth, onStartPlace, onCancelPlace, onTakeOff, onDelete, onClose }) {
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
  const shelfItems = inTray ? [] : plan.shelves.find((x) => x.id === where).items
  const place = inTray ? 'Off the shelf' : `${shelfLabel(plan, where)}, #${positions(shelfItems).get(item.uid) ?? index + 1}`
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
  if (info.gap) {
    const w = Number(item.widthIn) || 0
    return (
      <section className="selected-bar" data-testid="selected-panel" aria-label="Selected empty space">
        <div className="selected-head">
          <div className="selected-text">
            <div className="muted small">{shelfLabel(plan, where)}</div>
            <div className="selected-name">Empty space</div>
            <div className="muted small">Room left open on purpose. It counts toward the shelf width.</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="selected-actions">
          <div className="stepper" aria-label="Width of the empty space">
            <button className="btn step" onClick={() => onGapWidth(w - 0.5)} disabled={w <= 0.5} aria-label="Half an inch narrower">−</button>
            <div className="step-value"><span data-testid="gap-width">{fmtIn(w, 2)}</span><small>inches</small></div>
            <button className="btn step" onClick={() => onGapWidth(w + 0.5)} aria-label="Half an inch wider">+</button>
          </div>
          <button className="btn" onClick={onStartPlace}>Move</button>
          <button className="btn danger" onClick={onTakeOff}>Remove</button>
        </div>
      </section>
    )
  }
  const high = item.high || 1
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
          {high > 1 && ` · ${high} high`}
          {' · '}{placed.tooDeep ? <span className="warn">deeper than the shelf</span> : `about ${placed.unitsDeep} deep`}
          {movement && <> · <span data-testid="sells">{movement}</span></>}
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
          {placed && <div><dt>On the shelf</dt><dd>{placed.tooDeep ? 'won’t fit front to back' : `${placed.capacity} units (${item.facings} wide × ${placed.unitsDeep} deep${high > 1 ? ` × ${high} high` : ''})`}</dd></div>}
          {!inTray && (
            <div><dt>Stacked</dt><dd>
              <span className="mini-stepper">
                <button className="btn" onClick={() => onHigh(high - 1)} disabled={high <= 1} aria-label="One less high">−</button>
                <strong data-testid="high">{high} high</strong>
                <button className="btn" onClick={() => onHigh(high + 1)} aria-label="Stack one more high">+</button>
              </span>
            </dd></div>
          )}
          {info.specialOrder && <div><dt>Store</dt><dd>KEHE special order</dd></div>}
          {dims.source.w === 'guess' && <div><dt>Guess</dt><dd>from {dims.basis}</dd></div>}
          {dims.afi && <div><dt>AFI</dt><dd>{dims.afi.w} W × {dims.afi.h} H{dims.afi.d ? ` × ≈${dims.afi.d} D` : ''} in, from the {dims.afi.reset} planogram ({dims.afi.date})</dd></div>}
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
        const posOf = positions(shelf.items)
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
                if (p.gap) {
                  return (
                    <Row key={item.uid} item={item} position="·" info={info}
                      sub={`${fmtIn(p.widthIn, 2)} in left open`} warn={p.pastEdge ? 'past end of shelf' : ''}
                      selected={item.uid === selectedUid} onSelect={() => onSelect(item.uid, shelf.id)} />
                  )
                }
                const high = item.high || 1
                const mark = sourceMark(products.dims(item).source.w)
                const notes = []
                if (p.tooDeep) notes.push('too deep')
                if (p.tooTall) notes.push('too tall')
                if (p.pastEdge) notes.push('past end of shelf')
                if (!info.inCatalog) notes.push('not in store files')
                return (
                  <Row key={item.uid} item={item} position={posOf.get(item.uid)} info={info} photo={photos[item.upc]}
                    sub={`${info.size} · ${item.facings} facing${item.facings > 1 ? 's' : ''}${high > 1 ? `, ${high} high` : ''} · ${mark}${fmtIn(p.widthIn)} in${info.specialOrder ? ' · special order' : ''}`}
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
export function AddSheet({ index, catalog, targetLabel, inPlan = new Map(), onAdd, onAddGap, onScan, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const results = useMemo(() => search(index, q), [index, q])
  const sub = catalog.subclassNames || {}
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <Sheet title={`Add to ${targetLabel}`} onClose={onClose} tall>
      <button className="btn wide scan-btn" onClick={onScan} data-testid="open-scan">▥ Scan a barcode</button>
      <input
        ref={inputRef} className="search" type="search" inputMode="search"
        placeholder="Name or UPC, e.g. heinz ketchup 20"
        value={q} onChange={(e) => setQ(e.target.value)}
        aria-label="Search products" data-testid="search-input"
      />
      {q.trim() && !results.length && <p className="empty">No products match “{q}”.</p>}
      {!q.trim() && (
        <>
          <p className="muted">Type part of a name (any order: “ketchup hnz”) or the digits of a UPC. To add to a different shelf, close this and tap that shelf first.</p>
          <button className="btn wide" onClick={onAddGap} data-testid="add-gap">Add an empty space (2 in, change it after)</button>
        </>
      )}
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
                {inPlan.has(p.upc) && <span className="tag in-plan">in this plan: {inPlan.get(p.upc)}</span>}
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
export function ShelfSheet({ plan, shelf, catalog, inAisle, onSave, onAddShelf, onRemoveShelf, onClose, onReplaceData, onOpenGuesses }) {
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
      {inAisle ? (
        <p className="muted small">To add or remove shelves, open that section on its own (Plans, then Open).</p>
      ) : (
        <>
          <div className="btn-grid">
            <button className="btn" onClick={() => { onAddShelf('top'); onClose() }}>Add a shelf on top</button>
            <button className="btn" onClick={() => { onAddShelf('bottom'); onClose() }}>Add a shelf at bottom</button>
            <button className="btn danger" disabled={plan.shelves.length <= 1}
              onClick={() => { onRemoveShelf(shelf.id); onClose() }}>Remove this shelf</button>
          </div>
          <p className="muted small">Removing a shelf moves its products to “Off the shelf”. You can undo.</p>
        </>
      )}
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
  aisles = {}, currentAisleId, onOpenAisle, onNewAisle, onRenameAisle, onDeleteAisle,
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
      <AislesPart plans={plans} aisles={aisles} currentAisleId={currentAisleId}
        onOpenAisle={onOpenAisle} onNewAisle={onNewAisle} onRenameAisle={onRenameAisle} onDeleteAisle={onDeleteAisle} />

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

/** Aisles: several plans side by side. Pick the sections in order, left to right. */
function AislesPart({ plans, aisles, currentAisleId, onOpenAisle, onNewAisle, onRenameAisle, onDeleteAisle }) {
  const [making, setMaking] = useState(false)
  const [picked, setPicked] = useState([])
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)
  const list = Object.values(aisles).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const planList = Object.values(plans).sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  return (
    <>
      <h3 className="sheet-section">Aisles</h3>
      {list.length === 0 && !making && <p className="muted small">An aisle shows several sections side by side, so you can move products from one to the next.</p>}
      <ul className="plan-list" data-testid="aisle-list">
        {list.map((a) => (
          <li key={a.id} className={a.id === currentAisleId ? 'current' : ''}>
            {renaming === a.id ? (
              <form className="rename" onSubmit={(e) => { e.preventDefault(); onRenameAisle(a.id, name.trim() || a.name); setRenaming(null) }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Aisle name" />
                <button className="btn primary">Save</button>
              </form>
            ) : (
              <div className="plan-name">
                <strong>{a.name}</strong>
                <span className="muted small">
                  {a.id === currentAisleId ? 'Open now · ' : ''}
                  {a.planIds.filter((id) => plans[id]).map((id, i) => `${LETTERS[i]} = ${plans[id].name}`).join(' · ') || 'no sections left'}
                </span>
              </div>
            )}
            <div className="plan-btns">
              {a.id !== currentAisleId && <button className="btn primary" onClick={() => onOpenAisle(a.id)} data-testid="open-aisle">Open</button>}
              <button className="btn" onClick={() => { setRenaming(a.id); setName(a.name) }}>Rename</button>
              <button className="btn danger" onClick={() => onDeleteAisle(a.id)} aria-label={`Delete aisle ${a.name}`}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {!making ? (
        <button className="btn wide" onClick={() => { setMaking(true); setPicked([]); setName('') }} data-testid="new-aisle"
          disabled={planList.length < 2}>Make an aisle from plans…</button>
      ) : (
        <div className="make-aisle" data-testid="make-aisle">
          <p className="muted small">Tap the sections in order, left to right as you face the aisle.</p>
          <ul className="item-list">
            {planList.map((p) => {
              const n = picked.indexOf(p.id)
              return (
                <li key={p.id}>
                  <button className={`row${n >= 0 ? ' selected' : ''}`} onClick={() => toggle(p.id)} aria-pressed={n >= 0}>
                    <span className="row-pos">{n >= 0 ? n + 1 : ''}</span>
                    <span className="row-main"><span className="row-name">{p.name}</span>
                      <span className="row-sub">{p.shelves.length} shelves · {Math.max(...p.shelves.map((s) => s.widthIn)) / 12} ft</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
          <label className="field">
            <span>Aisle name</span>
            <input className="search" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laundry aisle" data-testid="aisle-name" />
          </label>
          <div className="btn-grid two">
            <button className="btn primary" disabled={picked.length < 2} onClick={() => { onNewAisle(name.trim() || 'New aisle', picked); setMaking(false) }} data-testid="save-aisle">
              Make the aisle ({picked.length})
            </button>
            <button className="btn" onClick={() => setMaking(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
