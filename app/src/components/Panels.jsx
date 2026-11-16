import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, ChevronRight, Copy, Download, Ellipsis, FolderOpen, MoveVertical, Pencil, Plus, Ruler, ScanBarcode, Search, Snowflake, Store, Trash2, Upload, XCircle } from 'lucide-react'
import { fmtIn } from '../lib/fit.js'
import { search } from '../lib/search.js'
import { prettyUpc } from '../lib/upc.js'
import { positions, shelfLabel } from '../lib/plan.js'
import { niceName, niceSize } from '../lib/text.js'
import { LETTERS } from '../lib/aisle.js'
import { sourceMark, SOURCE_LABEL } from '../lib/sizes.js'
import { useFullPhoto, useThumbs } from '../lib/usePhotos.js'
import { spaceUsed } from '../lib/storage.js'


const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
/** Short enough for a list: the time for today, otherwise the day. */
const whenChanged = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** The whole section at a glance. */
export function SectionSummary({ plan, check, anyGuess, missing, productCount }) {
  const notes = []
  if (check.tooDeep) notes.push(`${check.tooDeep} product${check.tooDeep > 1 ? 's' : ''} too deep for the shelf`)
  if (check.tooTall) notes.push(`${check.tooTall} product${check.tooTall > 1 ? 's' : ''} too tall for the room above`)
  if (missing) notes.push(`${missing} not in your store's item files`)
  const over = check.overCount
  const otherProblems = check.tooDeep + check.tooTall
  let status = 'Everything fits'
  if (over) status = `${over} ${over > 1 ? 'shelves' : 'shelf'} over`
  else if (otherProblems) status = 'Fits side to side'
  const tone = over ? 'over' : otherProblems ? 'caution' : 'ok'
  const Icon = over ? XCircle : otherProblems ? AlertTriangle : CheckCircle2
  return (
    <section className={`summary ${tone}`} aria-live="polite" data-testid="summary">
      <div className="summary-main">
        <Icon className="summary-icon" size={30} aria-hidden="true" />
        <div className="summary-text">
          <div className="big" data-testid="summary-status">{status}</div>
          <div className="sub">
            {plan.sections ? `${plan.sections.length} sections · ` : ''}{plan.shelves.length} shelves · {productCount} products
            {plan.tray.length ? ` · ${plan.tray.length} off the shelf` : ''}
          </div>
        </div>
      </div>
      {(notes.length > 0 || plan.sections) && (
        <div className="summary-chips">
          {notes.map((w) => <span key={w} className={`chip-note${/store's item files/.test(w) ? ' info' : ''}`}>{w}</span>)}
        </div>
      )}
      {plan.sections && (
        <p className="summary-notes aisle-key" data-testid="aisle-key">
          {plan.sections.map((sec) => <span key={sec.planId}><strong>{sec.letter}</strong> {sec.name}</span>)}
        </p>
      )}
      {anyGuess && <p className="summary-legend">~ = guessed size · ≈ = estimated</p>}
    </section>
  )
}

/** Everything about one product on a shelf: its photo, its size, how it fits, and moving it to another shelf. */
export function DetailsSheet({ plan, where, index, item, info, placed, dims, photo, thumb, movement, onEditSize, onPickPhoto, onRemovePhoto, onHigh, onDescribe, onStartPlace, onClose }) {
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState(null) // the name being typed for a product that is not in the store files
  const full = useFullPhoto(item.upc, photo) // the photo itself, read when the details open
  const photoUrl = photo ? full || thumb : null // the small copy until then
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    await onPickPhoto(f)
    setBusy(false)
  }
  const g = (k) => sourceMark(dims.source[k])
  const shelfItems = plan.shelves.find((x) => x.id === where).items
  const place = `${shelfLabel(plan, where)}, #${positions(shelfItems).get(item.uid) ?? index + 1}`
  const high = item.high || 1
  const sources = ['w', 'h', 'd'].map((k) => SOURCE_LABEL[dims.source[k]])
  const from = sources.every((x) => x === sources[0]) ? sources[0] : `W ${sources[0]} · H ${sources[1]} · D ${sources[2]}`
  const warns = []
  if (placed.tooDeep) warns.push('Deeper than the shelf')
  if (placed.tooTall) warns.push('Too tall for the room above the shelf')
  return (
    <Sheet title="Product details" onClose={onClose}>
      <section className="detail" data-testid="selected-panel" aria-label="Selected product">
        <div className="detail-head">
          <label className={`photo-slot${photo ? ' has-photo' : ''}`} aria-label={photo ? 'Change photo' : 'Add photo'}>
            {photoUrl ? <img src={photoUrl} alt="" data-full={full ? '1' : undefined} /> : <span>{busy ? '…' : photo ? '…' : '＋\nPhoto'}</span>}
            <input type="file" accept="image/*" onChange={pick} data-testid="photo-input" />
          </label>
          <div className="detail-text">
            <div className="detail-name">{niceName(info.description)}</div>
            <div className="muted small">{[niceSize(info.size), info.pack && `pack ${info.pack}`].filter(Boolean).join(' · ')}</div>
            <div className="muted small"><span className="nowrap">UPC {prettyUpc(info.upc)}</span> · {place}</div>
          </div>
        </div>
        {warns.length > 0 && <p className="detail-warn" role="status">{warns.join(' · ')}</p>}
        {!info.inCatalog && (
          <div className="detail-unknown" data-testid="detail-unknown">
            <p>This product is not in your store’s list, so its size is a rough guess.</p>
            {naming == null ? (
              <button className="btn" onClick={() => setNaming(/^UPC /.test(info.description) ? '' : info.description)} data-testid="name-it">Give it a name</button>
            ) : (
              <form className="rename" onSubmit={(e) => { e.preventDefault(); if (naming.trim()) onDescribe(naming); setNaming(null) }}>
                <input autoFocus value={naming} maxLength={60} onChange={(e) => setNaming(e.target.value)} aria-label="Product name" placeholder="e.g. Local honey 12 oz" />
                <button className="btn primary">Save</button>
              </form>
            )}
          </div>
        )}
        <dl className="facts">
          <div><dt>On the shelf</dt><dd data-testid="detail-width">
            {item.facings} × {g('w')}{fmtIn(dims.w, 2)} in = <strong>{g('w')}{fmtIn(placed.widthIn)} in wide</strong>
          </dd></div>
          <div><dt>Holds</dt><dd>{placed.tooDeep ? 'won’t fit front to back' : `${placed.capacity} units (${item.facings} wide × ${placed.unitsDeep} deep${high > 1 ? ` × ${high} high` : ''})`}</dd></div>
          {movement && <div><dt>Sells</dt><dd data-testid="sells">{movement}</dd></div>}
          <div><dt>Size each</dt><dd>{g('w')}{fmtIn(dims.w, 2)} W × {g('h')}{fmtIn(dims.h, 2)} H × {g('d')}{fmtIn(dims.d, 2)} D in</dd></div>
          <div><dt>Size from</dt><dd>{from}{dims.source.w === 'guess' ? ` (${dims.basis})` : ''}</dd></div>
          {dims.afi && <div><dt>AFI</dt><dd>{dims.afi.w} W × {dims.afi.h} H{dims.afi.d ? ` × ≈${dims.afi.d} D` : ''} in, from the {dims.afi.reset} planogram ({dims.afi.date})</dd></div>}
          {dims.note && <div><dt>Notes</dt><dd>{dims.note}</dd></div>}
          {info.specialOrder && <div><dt>Store</dt><dd>KEHE special order</dd></div>}
          <div className="facts-ctl"><dt>Stacked</dt><dd>
            <span className="mini-stepper">
              <button className="btn" onClick={() => onHigh(high - 1)} disabled={high <= 1} aria-label="One less high">−</button>
              <strong data-testid="high">{high} high</strong>
              <button className="btn" onClick={() => onHigh(high + 1)} aria-label="Stack one more high">+</button>
            </span>
          </dd></div>
          {photo && <div className="facts-ctl"><dt>Photo</dt><dd>{photo.source}{' '}<button className="link-btn" onClick={onRemovePhoto}>Remove photo</button></dd></div>}
        </dl>
        <div className="btn-grid two detail-btns">
          <button className="btn" onClick={onEditSize} data-testid="edit-size"><Ruler size={18} aria-hidden="true" />Edit size</button>
          <button className="btn primary" onClick={onStartPlace} data-testid="move-item"><MoveVertical size={18} aria-hidden="true" />Move</button>
        </div>
      </section>
    </Sheet>
  )
}

/** Asks before something that cannot be undone (instead of the phone's pop-up, which some phones let you block). */
export function ConfirmSheet({ title, text, yes, onYes, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p>{text}</p>
      <button className="btn danger wide" onClick={() => { onClose(); onYes() }} data-testid="confirm-yes">{yes}</button>
      <button className="btn wide" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}

/**
 * A panel that comes up from the bottom of the screen. Every panel in the app is one of these: a title, one
 * button to close it (also Escape, or a tap outside), and the content.
 * The keyboard focus moves into the panel when it opens and goes back to where it was when it closes.
 */
export function Sheet({ title, onClose, children, tall, doneLabel = 'Done' }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    const before = document.activeElement
    if (!ref.current?.contains(before)) ref.current?.focus({ preventScroll: true })
    return () => { if (before?.isConnected && before !== document.body) before.focus?.({ preventScroll: true }) }
  }, [])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn" onClick={onClose} data-testid="sheet-done">{doneLabel}</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Search the catalog by name or UPC and add to a shelf. */
export function AddSheet({ index, catalog, targetLabel, inPlan = new Map(), photoIndex = {}, onAdd, onAddGap, onScan, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const results = useMemo(() => search(index, q), [index, q])
  const thumbs = useThumbs(useMemo(() => results.map((p) => p.upc), [results]), photoIndex)
  const sub = catalog.subclassNames || {}
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <Sheet title={`Add to ${targetLabel}`} onClose={onClose} tall>
      <div className="search-row">
        <div className="search-wrap">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef} className="search" type="search" inputMode="search"
            placeholder="Name or UPC"
            value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search products" data-testid="search-input"
          />
        </div>
        <button className="icon-btn scan-btn" onClick={onScan} data-testid="open-scan" aria-label="Scan a barcode"><ScanBarcode size={24} aria-hidden="true" /></button>
      </div>
      {q.trim() && !results.length && <p className="empty">No products match “{q}”.</p>}
      {!q.trim() && (
        <>
          <p className="muted">Type part of a name, in any order, or the digits of a UPC.</p>
          <button className="btn wide" onClick={onAddGap} data-testid="add-gap">Add an empty space</button>
        </>
      )}
      <ul className="results">
        {results.map((p) => (
          <li key={p.upc}>
            {thumbs[p.upc] && <img className="frow-thumb" src={thumbs[p.upc]} alt="" />}
            <div className="result-main">
              <div className="row-name">{niceName(p.description)}</div>
              <div className="row-sub">
                {[niceSize(p.size), p.pack && `pack ${p.pack}`, sub[`${p.classCode}-${p.subclassCode}`], p.aisle].filter(Boolean).join(' · ')}
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
export function ShelfSheet({ plan, shelf, inAisle, onSave, onAddShelf, onRemoveShelf, onClose }) {
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
    </Sheet>
  )
}

/** One tab button of the Plans sheet (defined outside it, so focus stays on it after a tap). */
function PlanTab({ id, label, icon: I, tab, setTab }) {
  return (
    <button type="button" role="tab" aria-selected={tab === id} className={`tabs-btn${tab === id ? ' on' : ''}`} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
      <I size={18} aria-hidden="true" /> {label}
    </button>
  )
}

/**
 * One plan or aisle in the list: tap it to open it; the ⋯ button shows what else you can do with it
 * (the buttons passed as children).
 */
function EntryRow({ title, sub, current, menuOpen, onOpen, onMore, renameForm, openTestId, children }) {
  return (
    <li className={current ? 'current' : ''}>
      {renameForm || (
        <div className="plan-top">
          <button className="plan-open" onClick={onOpen} data-testid={openTestId} aria-label={current ? `${title}: open now` : `Open ${title}`}>
            <span className="row-main">
              <span className="row-name">{title}</span>
              <span className="row-sub">{current && <span className="badge">Open now</span>}{sub}</span>
            </span>
            {!current && <ChevronRight size={20} className="row-go" aria-hidden="true" />}
          </button>
          <button className="icon-btn ghost" onClick={onMore} aria-expanded={menuOpen} aria-label={`More for ${title}`} data-testid="entry-more">
            <Ellipsis size={22} aria-hidden="true" />
          </button>
        </div>
      )}
      {menuOpen && !renameForm && <div className="plan-btns">{children}</div>}
    </li>
  )
}

/** All saved plans: open, copy, rename, delete, start new, back up. */
export function PlansSheet({
  plans, currentId, resets, lastBackupAt, backupDue = false, photoCount = 0, storeInfo = '', onOpen, onDuplicate, onRename, onDelete,
  onNewBlank, onNewAfi, onExport, onImportFile, onClose,
  aisles = {}, currentAisleId, onOpenAisle, onNewAisle, onRenameAisle, onDeleteAisle,
}) {
  const [tab, setTab] = useState('plans') // plans | new | backup
  const [kind, setKind] = useState('afi') // under New: afi | blank | aisle
  const [menu, setMenu] = useState(null) // the plan or aisle whose Copy / Rename / Delete buttons are showing
  const [renaming, setRenaming] = useState(null)
  const [name, setName] = useState('')
  const [blank, setBlank] = useState({ shelves: 5, widthIn: 48 })
  const [msg, setMsg] = useState(null)
  const [resetQ, setResetQ] = useState('')
  const list = Object.values(plans).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const aisleList = Object.values(aisles).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setMsg(await onImportFile(f, setMsg)) // a long load says how far it got in the same place
  }
  const [used, setUsed] = useState(null) // bytes this app uses on the phone, where the browser says
  useEffect(() => {
    if (tab !== 'backup') return undefined
    let live = true
    spaceUsed().then((n) => { if (live) setUsed(n) })
    return () => { live = false }
  }, [tab, photoCount])
  const matches = resets.filter((r) => resetQ.trim().split(/\s+/).every((w) => `${r.name} ${r.fixture || ''} ${r.date}`.toLowerCase().includes(w.toLowerCase())))
  const groups = [
    ['Shelves', matches.filter((r) => !r.fixture)],
    ['Freezer', matches.filter((r) => r.fixture)],
  ].filter(([, list]) => list.length)
  const toggleMenu = (id) => setMenu(menu === id ? null : id)
  const startRename = (id, current) => { setRenaming(id); setName(current) }
  const renameForm = (label, onSave) => (
    <form className="rename" onSubmit={(e) => { e.preventDefault(); onSave(name.trim()); setRenaming(null); setMenu(null) }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={label} />
      <button className="btn primary">Save</button>
    </form>
  )
  const kindChip = (id, label) => (
    <button type="button" className={`chip${kind === id ? ' on' : ''}`} aria-pressed={kind === id} onClick={() => setKind(id)} data-testid={`new-${id}`}>{label}</button>
  )
  return (
    <Sheet title="Plans" onClose={onClose} tall>
      {backupDue && (
        <div className="backup-due" role="status" data-testid="backup-due">
          <span>{lastBackupAt ? 'Your last backup is over a week old.' : 'Your plans are not backed up yet.'} They live only on this phone.</span>
          <button className="btn" onClick={async () => setMsg(await onExport())} data-testid="backup-now">Back up now</button>
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Your plans, a new plan, and backup">
        <PlanTab id="plans" label="Your plans" icon={FolderOpen} tab={tab} setTab={setTab} />
        <PlanTab id="new" label="New" icon={Plus} tab={tab} setTab={setTab} />
        <PlanTab id="backup" label="Backup" icon={Archive} tab={tab} setTab={setTab} />
      </div>
      {msg && <p className={msg.startsWith('Could not') || msg.startsWith('This is not') ? 'error' : 'ok-msg'} role="status">{msg}</p>}

      <div role="tabpanel" hidden={tab !== 'plans'}>
        {aisleList.length > 0 && (
          <>
            <h3 className="sheet-section">Aisles ({aisleList.length})</h3>
            <ul className="plan-list" data-testid="aisle-list">
              {aisleList.map((a) => (
                <EntryRow key={a.id} title={a.name} current={a.id === currentAisleId} menuOpen={menu === a.id}
                  sub={a.planIds.filter((id) => plans[id]).map((id, i) => `${LETTERS[i]} = ${plans[id].name}`).join(' · ') || 'no sections left'}
                  onOpen={() => (a.id === currentAisleId ? onClose() : onOpenAisle(a.id))} onMore={() => toggleMenu(a.id)} openTestId="open-aisle"
                  renameForm={renaming === a.id ? renameForm('Aisle name', (n) => onRenameAisle(a.id, n || a.name)) : null}>
                  <button className="btn ghost" onClick={() => startRename(a.id, a.name)}><Pencil size={16} aria-hidden="true" />Rename</button>
                  <button className="btn ghost danger" onClick={() => onDeleteAisle(a.id)} aria-label={`Delete aisle ${a.name}`}><Trash2 size={16} aria-hidden="true" />Delete</button>
                </EntryRow>
              ))}
            </ul>
            <h3 className="sheet-section">Sections ({list.length})</h3>
          </>
        )}
        <ul className="plan-list" data-testid="plan-list">
          {list.map((p) => (
            <EntryRow key={p.id} title={p.name} current={p.id === currentId} menuOpen={menu === p.id}
              sub={`${p.shelves.length} shelves · ${Number((Math.max(...p.shelves.map((x) => x.widthIn)) / 12).toFixed(1))} ft${p.id === currentId ? '' : ` · changed ${whenChanged(p.updatedAt)}`}`}
              onOpen={() => (p.id === currentId ? onClose() : onOpen(p.id))} onMore={() => toggleMenu(p.id)} openTestId="open-plan"
              renameForm={renaming === p.id ? renameForm('Plan name', (n) => onRename(p.id, n || p.name)) : null}>
              <button className="btn ghost" onClick={() => onDuplicate(p.id)}><Copy size={16} aria-hidden="true" />Copy</button>
              <button className="btn ghost" onClick={() => startRename(p.id, p.name)}><Pencil size={16} aria-hidden="true" />Rename</button>
              <button className="btn ghost danger" onClick={() => onDelete(p.id)} aria-label={`Delete ${p.name}`}><Trash2 size={16} aria-hidden="true" />Delete</button>
            </EntryRow>
          ))}
        </ul>
        <button className="btn wide" onClick={() => setTab('new')} data-testid="new-plan"><Plus size={18} aria-hidden="true" /> New plan</button>
      </div>

      <div role="tabpanel" hidden={tab !== 'new'}>
        <div className="chips kind-chips" role="group" aria-label="What to start from">
          {kindChip('afi', 'AFI set')}
          {kindChip('blank', 'Empty section')}
          {kindChip('aisle', 'Aisle')}
        </div>

        {kind === 'afi' && (
          <>
            <p className="muted small">Copies a whole AFI set into a new plan, with AFI’s facings and shelf heights.</p>
            <div className="search-wrap">
              <Search size={20} aria-hidden="true" />
              <input className="search" type="search" placeholder="Find a set, e.g. ketchup or freezer" value={resetQ}
                onChange={(e) => setResetQ(e.target.value)} aria-label="Find an AFI set" data-testid="reset-search" />
            </div>
            {groups.map(([title, list]) => (
              <section key={title}>
                <h3 className="sheet-section">{title === 'Freezer' ? <Snowflake size={18} aria-hidden="true" /> : <Store size={18} aria-hidden="true" />} {title} ({list.length})</h3>
                <ul className="item-list">
                  {list.map((r) => {
                    const levels = new Set(r.shelves.map((x) => x.shelf)).size
                    const products = r.shelves.reduce((n, x) => n + x.items.length, 0)
                    return (
                      <li key={r.id}>
                        <button className="row" onClick={() => onNewAfi(r)} data-testid={`afi-${r.id}`}>
                          <span className="row-main">
                            <span className="row-name">{niceName(r.name)}</span>
                            <span className="row-sub">
                              {r.fixture ? `${r.fixture} · ` : ''}{Number(r.widthFt.toFixed(2))} ft · {levels} shelves · {products} products · AFI {r.date}
                            </span>
                          </span>
                          <ChevronRight size={20} className="row-go" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {!matches.length && <p className="empty">No AFI set matches “{resetQ}”.</p>}
          </>
        )}

        {kind === 'blank' && (
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
                {[30, 36, 48, 96].map((w) => (
                  <button key={w} type="button" className={`chip${blank.widthIn === w ? ' on' : ''}`} onClick={() => setBlank({ ...blank, widthIn: w })}>{w} in</button>
                ))}
              </div>
            </div>
            <button className="btn primary wide" onClick={() => onNewBlank(blank)} data-testid="start-blank">Start an empty section</button>
          </div>
        )}

        {kind === 'aisle' && <MakeAisle plans={plans} onNewAisle={onNewAisle} />}
      </div>

      <div role="tabpanel" hidden={tab !== 'backup'}>
        <div className="backup-card">
          <p>
            One file with all your plans, aisles, your own photos, sizes and the store data. Save it to Files (or email it to yourself),
            and use it to move to a new phone.
          </p>
          <p className="muted small" data-testid="backup-photo-note">
            Store pictures from photo packs are not in backups: on a new phone, load the photo pack files again.
          </p>
          <p className="muted small">Last backup: <strong>{lastBackupAt ? shortDate(lastBackupAt) : 'never'}</strong></p>
          <p className="muted small" data-testid="storage-info">
            Photos on this phone: <strong data-testid="photo-count">{photoCount.toLocaleString()}</strong>
            {used != null && <> · Space used: <strong>{(used / 1e6).toFixed(used < 1e7 ? 1 : 0)} MB</strong></>}
          </p>
          {storeInfo && <p className="muted small" data-testid="store-info">{storeInfo}</p>}
          <button className="btn primary wide" onClick={async () => setMsg(await onExport())} data-testid="export-backup"><Download size={18} aria-hidden="true" /> Export backup</button>
          <label className="btn wide file-btn">
            <Upload size={18} aria-hidden="true" /> Import a file
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={pick} data-testid="import-file" />
          </label>
          <p className="muted small">Import takes a backup, a photo or size pack, a newer store-data file, or a product list saved as CSV. It never deletes your plans.</p>
        </div>
      </div>
    </Sheet>
  )
}

/** A new aisle: several plans side by side. Pick the sections in order, left to right. */
function MakeAisle({ plans, onNewAisle }) {
  const [picked, setPicked] = useState([])
  const [name, setName] = useState('')
  const planList = Object.values(plans).sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  if (planList.length < 2) {
    return <p className="empty" data-testid="aisle-needs-two">An aisle shows sections side by side. Make at least two sections first.</p>
  }
  return (
    <div className="make-aisle" data-testid="make-aisle">
      <p className="muted small">An aisle shows sections side by side. Tap them in order, left to right as you face the aisle.</p>
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
      <button className="btn primary wide" disabled={picked.length < 2} onClick={() => onNewAisle(name.trim() || 'New aisle', picked)} data-testid="save-aisle">
        Make the aisle ({picked.length})
      </button>
    </div>
  )
}
