import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import ShelfView from './components/ShelfView.jsx'
import { AddSheet, AfiSheet, ItemList, SelectedPanel, ShelfSheet, Summary } from './components/Panels.jsx'
import { checkShelf, fmtIn } from './lib/fit.js'
import { buildIndex } from './lib/search.js'
import { emptyShelf, historyReducer, initHistory, newUid } from './lib/shelf.js'
import { makeProducts } from './lib/products.js'
import { askToKeepData, load, save, validateCatalog } from './lib/storage.js'

const MIN_SCALE = 3 // px per inch
const MAX_SCALE = 40

export function shelfFromAfi(reset, s) {
  return {
    name: `${reset.name} · shelf ${s.shelf}`,
    widthIn: reset.widthFt * 12,
    depthIn: 24,
    clearanceIn: 12,
    note: `From the AFI ${reset.name} reset (${reset.date}). AFI planned this shelf ${s.depthIn} in deep; it is set to your standard 24 in.`,
    items: s.items.map((i) => ({ uid: newUid(), upc: i.upc, facings: i.facings, description: i.description, size: i.size })),
  }
}

function demoShelf(catalog) {
  const reset = catalog.resets?.find((r) => /KETCHUP/i.test(r.name))
  const s = reset?.shelves.find((x) => x.shelf === 4) || reset?.shelves[0]
  return reset && s ? shelfFromAfi(reset, s) : emptyShelf()
}

export default function App() {
  const [phase, setPhase] = useState('loading') // loading | needData | ready
  const [catalog, setCatalog] = useState(null)
  const [hist, dispatch] = useReducer(historyReducer, null, () => initHistory(emptyShelf()))
  const [selectedUid, setSelectedUid] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [zoom, setZoom] = useState(null) // null = fit the shelf to the screen
  const [toast, setToast] = useState(null)
  const [boxWidth, setBoxWidth] = useState(360)
  const boxRef = useRef(null)
  const toastTimer = useRef(null)
  const shelf = hist.present

  // Load saved data from this device.
  useEffect(() => {
    (async () => {
      try {
        const [cat, saved] = await Promise.all([load('catalog'), load('shelf')])
        if (cat && !validateCatalog(cat)) {
          setCatalog(cat)
          dispatch({ type: 'replaceAll', shelf: saved || demoShelf(cat) })
          setPhase('ready')
        } else {
          setPhase('needData')
        }
      } catch (e) {
        console.error(e)
        setPhase('needData')
      }
    })()
  }, [])

  // Save the shelf after every change.
  useEffect(() => {
    if (phase === 'ready') save('shelf', shelf).catch((e) => console.error('save failed', e))
  }, [shelf, phase])

  // Measure the space the shelf drawing has, to fit it to the screen.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth))
    ro.observe(el)
    setBoxWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [phase])

  const products = useMemo(() => makeProducts(catalog), [catalog])
  const index = useMemo(() => (catalog ? buildIndex(catalog) : []), [catalog])
  const fit = useMemo(() => checkShelf(shelf, (item) => products.dims(item)), [shelf, products])

  // "Fit" shows the whole shelf, plus anything hanging past the end when it is over.
  const fitScale = Math.max(MIN_SCALE, (boxWidth - 28) / (Math.max(shelf.widthIn, fit.usedIn) + 3))
  const scale = zoom ?? fitScale

  const showToast = useCallback((text, undoable = false) => {
    clearTimeout(toastTimer.current)
    setToast({ text, undoable })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const selected = shelf.items.find((i) => i.uid === selectedUid)
  const selectedIndex = shelf.items.findIndex((i) => i.uid === selectedUid)

  const act = (a, message) => {
    dispatch(a)
    if (message) showToast(message, true)
  }

  const onMove = (uid, insertBefore) => {
    const from = shelf.items.findIndex((i) => i.uid === uid)
    if (insertBefore === from || insertBefore === from + 1) {
      setPlacing(false)
      return
    }
    act({ type: 'move', uid, insertBefore }, 'Moved')
    setSelectedUid(uid)
    setPlacing(false)
  }

  const onAdd = (p) => {
    const uid = newUid()
    const index = selectedIndex >= 0 ? selectedIndex + 1 : shelf.items.length
    act({ type: 'add', uid, upc: p.upc, description: p.description, size: p.size, index }, `Added ${p.description}`)
    setSelectedUid(uid)
    setSheet(null)
  }

  const onLoadAfi = (reset, s) => {
    act({ type: 'load', shelf: shelfFromAfi(reset, s) }, `Loaded AFI ${reset.name}, shelf ${s.shelf}`)
    setSelectedUid(null)
    setPlacing(false)
    setZoom(null)
    setSheet(null)
  }

  const undo = () => { dispatch({ type: 'undo' }); setPlacing(false); showToast('Undone') }
  const redo = () => { dispatch({ type: 'redo' }); setPlacing(false); showToast('Redone') }

  const onDataFile = async (file) => {
    const text = await file.text()
    let doc
    try { doc = JSON.parse(text) } catch { return 'That file could not be read. Pick the catalog.json file.' }
    const problem = validateCatalog(doc)
    if (problem) return problem
    await save('catalog', doc)
    await askToKeepData()
    setCatalog(doc)
    const saved = await load('shelf')
    dispatch({ type: 'replaceAll', shelf: saved || demoShelf(doc) })
    setPhase('ready')
    setSheet(null)
    return null
  }

  if (phase === 'loading') return <div className="center-msg">Loading…</div>
  if (phase === 'needData' || sheet === 'data') {
    return <ImportScreen onFile={onDataFile} onCancel={phase === 'ready' ? () => setSheet(null) : null} />
  }

  const warnings = []
  const count = (k) => fit.items.filter((p) => p[k]).length
  if (count('tooDeep')) warnings.push(`${count('tooDeep')} too deep for a ${fmtIn(shelf.depthIn)} in shelf`)
  if (count('tooTall')) warnings.push(`${count('tooTall')} taller than the ${fmtIn(shelf.clearanceIn)} in clearance`)
  const missing = shelf.items.filter((i) => !products.info(i).inCatalog).length
  if (missing) warnings.push(`${missing} not in your store's item files`)
  const anyGuess = shelf.items.some((i) => products.isGuess(products.dims(i)))

  return (
    <div className="app">
      <header className="topbar">
        <button className="title-btn" onClick={() => setSheet('shelf')} aria-label="Shelf name and size">
          <span className="title">{shelf.name}</span>
          <span className="muted">{fmtIn(shelf.widthIn)} W × {fmtIn(shelf.depthIn)} D in · {fmtIn(shelf.clearanceIn)} in clearance ✎</span>
        </button>
        <div className="topbar-actions">
          <button className="icon-btn labeled" onClick={undo} disabled={!hist.past.length} aria-label="Undo">↶<small>Undo</small></button>
          <button className="icon-btn labeled" onClick={redo} disabled={!hist.future.length} aria-label="Redo">↷<small>Redo</small></button>
        </div>
      </header>

      <main>
        <Summary shelf={shelf} fit={fit} anyGuess={anyGuess} warnings={warnings} />

        <section className={`shelf-card${placing ? ' placing' : ''}`} ref={boxRef}>
          <div className="zoom-row">
            <span className="muted small">{placing ? 'Tap a spot on the shelf' : 'Hold a product to drag it'}</span>
            <div className="zoom-btns">
              <button className="icon-btn" onClick={() => setZoom(Math.max(MIN_SCALE, scale / 1.4))} aria-label="Zoom out">−</button>
              <button className="btn small-btn" onClick={() => setZoom(null)} aria-pressed={zoom == null}>Fit</button>
              <button className="icon-btn" onClick={() => setZoom(Math.min(MAX_SCALE, scale * 1.4))} aria-label="Zoom in">+</button>
            </div>
          </div>
          <ShelfView
            shelf={shelf}
            fit={fit}
            products={products}
            scale={scale}
            selectedUid={selectedUid}
            placing={placing}
            onTapItem={(uid) => setSelectedUid(uid === selectedUid ? null : uid)}
            onMove={onMove}
            onPlace={onMove}
            onTapEmpty={() => { setSelectedUid(null); setPlacing(false) }}
          />
        </section>

        {selected && (
          <SelectedPanel
            item={selected}
            info={products.info(selected)}
            dims={products.dims(selected)}
            placed={fit.items[selectedIndex]}
            position={selectedIndex + 1}
            placing={placing}
            clearanceIn={shelf.clearanceIn}
            onFacings={(n) => act({ type: 'facings', uid: selected.uid, facings: n })}
            onStartPlace={() => setPlacing(true)}
            onCancelPlace={() => setPlacing(false)}
            onRemove={() => { act({ type: 'remove', uid: selected.uid }, `Removed ${products.info(selected).description}`); setSelectedUid(null); setPlacing(false) }}
            onClose={() => { setSelectedUid(null); setPlacing(false) }}
          />
        )}

        <h2 className="list-title">On this shelf, left to right</h2>
        <ItemList shelf={shelf} fit={fit} products={products} selectedUid={selectedUid}
          onSelect={(uid) => { setSelectedUid(uid); setPlacing(false) }} />
        {shelf.note && <p className="muted small note">{shelf.note}</p>}
      </main>

      <nav className="bottombar">
        <button className="btn primary" onClick={() => setSheet('add')} data-testid="open-add">＋ Add product</button>
        <button className="btn" onClick={() => setSheet('afi')}>AFI sets</button>
        <button className="btn" onClick={() => setSheet('shelf')}>Shelf size</button>
      </nav>

      {sheet === 'add' && <AddSheet index={index} catalog={catalog} onAdd={onAdd} onClose={() => setSheet(null)} />}
      {sheet === 'afi' && <AfiSheet resets={catalog.resets || []} products={products} onLoad={onLoadAfi} onClose={() => setSheet(null)} />}
      {sheet === 'shelf' && (
        <ShelfSheet shelf={shelf} catalog={catalog}
          onSave={(changes) => act({ type: 'shelf', changes }, 'Shelf updated')}
          onClose={() => setSheet(null)}
          onReplaceData={() => setSheet('data')} />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undoable && <button className="btn" onClick={() => { undo(); setToast(null) }}>Undo</button>}
        </div>
      )}
    </div>
  )
}

function ImportScreen({ onFile, onCancel }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    const problem = await onFile(file).catch((err) => `Something went wrong: ${err.message}`)
    setBusy(false)
    if (problem) setError(problem)
    e.target.value = ''
  }
  return (
    <div className="import">
      <h1>Shelf Planner</h1>
      <p>Plan shelf sets in real inches and see what fits before you move anything.</p>
      <div className="import-card">
        <h2>Load your store data</h2>
        <p>
          The app needs your store's product list once. It is the file <strong>catalog.json</strong>.
          It has product names, sizes and UPCs, with no costs or prices.
        </p>
        <p className="muted">
          The file stays on this phone. Nothing is uploaded anywhere.
        </p>
        <label className={`btn primary wide file-btn${busy ? ' busy' : ''}`}>
          {busy ? 'Loading…' : 'Choose catalog.json'}
          <input type="file" accept=".json,application/json" onChange={pick} disabled={busy} data-testid="data-file" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {onCancel && <button className="btn wide" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
