import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import SectionView from './components/SectionView.jsx'
import { AddSheet, PlansSheet, SectionList, SectionSummary, SelectedBar, ShelfSheet } from './components/Panels.jsx'
import { checkPlan } from './lib/fit.js'
import { buildIndex } from './lib/search.js'
import {
  TRAY, applyPlanAction, duplicatePlan, findItem, historyReducer, initHistory, newId, newPlan,
  planFromAfi, planFromOldShelf, shelfLabel,
} from './lib/plan.js'
import { makeProducts } from './lib/products.js'
import { askToKeepData, load, loadPrefix, remove, save } from './lib/storage.js'
import { cleanPhotos, mergePhotos, processPhoto } from './lib/photos.js'
import { cleanSizes, mergeSizes } from './lib/sizes.js'
import { GuessTableSheet, SizeSheet } from './components/SizeTools.jsx'
import { PrintSheet } from './components/PrintSheet.jsx'
import { ToolsSheet } from './components/ToolsSheet.jsx'
import { CompareSheet } from './components/CompareSheet.jsx'
import { CHANGE_COLUMNS, changeRows, comparePlans } from './lib/compare.js'
import { MovementSheet } from './components/MovementSheet.jsx'
import { cleanMovement, paceText, parseMovementCsv, salesRows, suggestions } from './lib/movement.js'
import { backupFileName, identifyFile, makeBackup, mergePlans, shareOrDownload } from './lib/backup.js'

const MIN_SCALE = 3 // px per inch
const MAX_SCALE = 40

function starterPlan(catalog) {
  const r = catalog.resets?.find((x) => /KETCHUP/i.test(x.name))
  return r ? planFromAfi(r) : newPlan({ name: 'My section' })
}

const mostRecent = (plans) =>
  Object.values(plans).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]

export default function App() {
  const [phase, setPhase] = useState('loading') // loading | needData | ready
  const [catalog, setCatalog] = useState(null)
  const [plans, setPlans] = useState({})
  const plansRef = useRef({})
  const [hist, dispatch] = useReducer(historyReducer, null, () => initHistory(newPlan()))
  const [selectedUid, setSelectedUid] = useState(null)
  const [activeShelfId, setActiveShelfId] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [zoom, setZoom] = useState(null) // null = fit the section to the screen
  const [toast, setToast] = useState(null)
  const [lastBackupAt, setLastBackupAt] = useState(null)
  const [photos, setPhotos] = useState({}) // UPC -> { data, w, h, source, addedAt }
  const [sizes, setSizes] = useState({}) // UPC -> real sizes { w, h, d, type, note }
  const [guessEdits, setGuessEdits] = useState({}) // package type -> edited typical size
  const [boxWidth, setBoxWidth] = useState(360)
  const [compareId, setCompareId] = useState(null) // the plan the open plan is compared with
  const [movement, setMovement] = useState(null) // units sold by UPC (no money), from a sales file
  const [pendingCsv, setPendingCsv] = useState(null) // a CSV waiting for its number of days
  const [deliveryDays, setDeliveryDays] = useState(7)
  const boxRef = useRef(null)
  const toastTimer = useRef(null)
  const plan = hist.present

  const commitPlans = useCallback((next) => {
    plansRef.current = next
    setPlans(next)
    save('plans', next).catch((e) => console.error('save failed', e))
  }, [])

  const openPlan = useCallback((p) => {
    dispatch({ type: 'open', plan: p })
    setSelectedUid(null)
    setPlacing(false)
    setZoom(null)
    setActiveShelfId(p.shelves[p.shelves.length - 1].id)
  }, [])

  const startWith = useCallback((cat, saved, currentId, oldShelf) => {
    let all = saved && Object.keys(saved).length ? saved : null
    if (!all) {
      const p = oldShelf ? planFromOldShelf(oldShelf) : starterPlan(cat)
      all = { [p.id]: p }
    }
    commitPlans(all)
    openPlan(all[currentId] || mostRecent(all))
    setPhase('ready')
  }, [commitPlans, openPlan])

  // Load what is saved on this device.
  useEffect(() => {
    (async () => {
      try {
        const [cat, saved, currentId, oldShelf, lastBk] = await Promise.all(
          ['catalog', 'plans', 'currentPlanId', 'shelf', 'lastBackupAt'].map((k) => load(k)))
        setLastBackupAt(lastBk || null)
        const savedPhotos = await loadPrefix('photo:').catch(() => ({}))
        setPhotos(Object.fromEntries(Object.entries(savedPhotos).map(([k, v]) => [k.slice(6), v])))
        const savedSizes = await loadPrefix('size:').catch(() => ({}))
        setSizes(Object.fromEntries(Object.entries(savedSizes).map(([k, v]) => [k.slice(5), v])))
        setGuessEdits((await load('guessEdits').catch(() => null)) || {})
        const mv = await load('movement').catch(() => null)
        if (mv) setMovement(cleanMovement(mv))
        setDeliveryDays((await load('deliveryDays').catch(() => null)) || 7)
        if (identifyFile(cat).type === 'catalog') {
          setCatalog(cat)
          startWith(cat, saved, currentId, oldShelf)
        } else setPhase('needData')
      } catch (e) {
        console.error(e)
        setPhase('needData')
      }
    })()
  }, [startWith])

  // Save the open plan after every change.
  useEffect(() => {
    if (phase !== 'ready') return
    commitPlans({ ...plansRef.current, [plan.id]: plan })
    save('currentPlanId', plan.id).catch(() => {})
  }, [plan, phase, commitPlans])

  // Measure the space for the drawing, to fit the section to the screen.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth))
    ro.observe(el)
    setBoxWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [phase])

  const products = useMemo(() => makeProducts(catalog, { sizes, guessEdits }), [catalog, sizes, guessEdits])
  const index = useMemo(() => (catalog ? buildIndex(catalog) : []), [catalog])
  const check = useMemo(() => checkPlan(plan, (item) => products.dims(item)), [plan, products])
  const sales = useMemo(() => (movement ? salesRows(plan, check, products, movement) : []), [plan, check, products, movement])
  const tips = useMemo(() => suggestions(plan, check, sales, { deliveryDays }), [plan, check, sales, deliveryDays])
  const fitScale = Math.max(MIN_SCALE, (boxWidth - 28) / (check.widestIn + 3))
  const scale = zoom ?? fitScale

  const showToast = useCallback((text, undoable = false) => {
    clearTimeout(toastTimer.current)
    setToast({ text, undoable })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  /** Save several photos on the phone at once. */
  const storePhotos = async (incoming) => {
    const { merged, added, replaced } = mergePhotos(photos, incoming)
    for (const upc of Object.keys(merged)) {
      if (merged[upc] !== photos[upc]) await save(`photo:${upc}`, merged[upc])
    }
    setPhotos(merged)
    return { added, replaced }
  }

  const onPickPhoto = async (item, file) => {
    try {
      const p = await processPhoto(file)
      const rec = { ...p, source: 'your photo', addedAt: new Date().toISOString() }
      await save(`photo:${item.upc}`, rec)
      setPhotos((all) => ({ ...all, [item.upc]: rec }))
      showToast('Photo saved for this product')
    } catch (e) {
      showToast(e.message || 'Could not use that picture')
    }
  }

  const onSaveSize = async (upc, rec) => {
    if (rec) await save(`size:${upc}`, rec)
    else await remove(`size:${upc}`)
    setSizes((all) => { const next = { ...all }; if (rec) next[upc] = rec; else delete next[upc]; return next })
    showToast(rec ? 'Size saved for this product everywhere' : 'Back to guessed size')
  }

  const storeSizes = async (incoming) => {
    const { merged, changed } = mergeSizes(sizes, incoming)
    for (const upc of Object.keys(merged)) if (merged[upc] !== sizes[upc]) await save(`size:${upc}`, merged[upc])
    setSizes(merged)
    return changed
  }

  const storeMovement = async (doc) => {
    const m = cleanMovement({ ...doc, loadedAt: new Date().toISOString() })
    await save('movement', m)
    setMovement(m)
    const onPlans = Object.values(plansRef.current).flatMap((p) => p.shelves.flatMap((x) => x.items)).filter((i) => i.kind !== 'gap')
    const found = new Set(onPlans.filter((i) => m.items[i.upc]).map((i) => i.upc)).size
    const total = new Set(onPlans.map((i) => i.upc)).size
    return `Sales file loaded: ${Object.keys(m.items).length.toLocaleString()} products (${found} of the ${total} products in your plans). Units sold only.`
  }

  /** A .json movement file or a .csv export, picked under Tools > Sales help. */
  const onMovementFile = async (file) => {
    const text = await file.text()
    if (/\.csv$/i.test(file.name) || !text.trim().startsWith('{')) {
      const r = parseMovementCsv(text, (u) => products.byUpc.has(u))
      if (r.problem) return `Could not read it: ${r.problem}`
      if (!Object.keys(r.items).length) return 'Could not read it: no lines matched products in your store data.'
      setPendingCsv(r)
      return null
    }
    return onImportFile(file)
  }

  const onSaveGuesses = async (edits) => {
    await save('guessEdits', edits)
    setGuessEdits(edits)
    showToast(Object.keys(edits).length ? 'Default guesses updated' : 'Default guesses reset')
  }

  const onRemovePhoto = async (item) => {
    await remove(`photo:${item.upc}`)
    setPhotos((all) => { const next = { ...all }; delete next[item.upc]; return next })
    showToast('Photo removed')
  }

  const act = (a, message) => {
    if (applyPlanAction(plan, a) === plan) return false // nothing would change
    dispatch(a)
    if (message) showToast(message, true)
    return true
  }

  const activeShelf = plan.shelves.find((s) => s.id === activeShelfId) || plan.shelves[plan.shelves.length - 1]
  const sel = selectedUid ? findItem(plan, selectedUid) : null

  // ---------- product actions ----------
  const onMove = (uid, shelfId, insertBefore) => {
    const fromTray = findItem(plan, uid)?.where === TRAY
    act({ type: 'move', uid, to: shelfId, insertBefore }, fromTray ? `Put on ${shelfLabel(plan, shelfId)}` : 'Moved')
    setPlacing(false)
    setSelectedUid(uid)
    setActiveShelfId(shelfId)
  }

  const onAdd = (p) => {
    const uid = newId('i')
    const onShelf = sel && sel.where !== TRAY
    const shelfId = onShelf ? sel.where : activeShelf.id
    const at = onShelf ? sel.index + 1 : undefined
    act({ type: 'add', shelfId, index: at, uid, upc: p.upc, description: p.description, size: p.size },
      `Added to ${shelfLabel(plan, shelfId)}`)
    setSelectedUid(uid)
    setActiveShelfId(shelfId)
    setSheet(null)
  }

  const onAddGap = () => {
    const uid = newId('g')
    const onShelf = sel && sel.where !== TRAY
    const shelfId = onShelf ? sel.where : activeShelf.id
    act({ type: 'addGap', shelfId, index: onShelf ? sel.index + 1 : undefined, uid, widthIn: 2 },
      `Empty space added to ${shelfLabel(plan, shelfId)}`)
    setSelectedUid(uid)
    setActiveShelfId(shelfId)
    setSheet(null)
  }

  const undo = () => { dispatch({ type: 'undo' }); setPlacing(false); showToast('Undone') }
  const redo = () => { dispatch({ type: 'redo' }); setPlacing(false); showToast('Redone') }

  // ---------- plan actions ----------
  const allPlans = () => ({ ...plansRef.current, [plan.id]: plan })

  const onOpenPlan = (id) => {
    openPlan(plansRef.current[id])
    setSheet(null)
    showToast(`Opened ${plansRef.current[id].name}`)
  }
  const onDuplicate = (id) => {
    const src = id === plan.id ? plan : plansRef.current[id]
    const copy = duplicatePlan(src)
    commitPlans({ ...allPlans(), [copy.id]: copy })
    openPlan(copy)
    setSheet(null)
    showToast(`Now editing the copy: ${copy.name}`)
  }
  const onRename = (id, name) => {
    if (id === plan.id) dispatch({ type: 'rename', name })
    else commitPlans({ ...plansRef.current, [id]: { ...plansRef.current[id], name, updatedAt: new Date().toISOString() } })
  }
  const onDeletePlan = (id) => {
    const victim = id === plan.id ? plan : plansRef.current[id]
    if (!window.confirm(`Delete the plan “${victim.name}”? This cannot be undone.`)) return
    const rest = { ...allPlans() }
    delete rest[id]
    if (id === plan.id) {
      const next = mostRecent(rest) || newPlan({ name: 'My section' })
      rest[next.id] = next
      commitPlans(rest)
      openPlan(next)
    } else commitPlans(rest)
    showToast(`Deleted ${victim.name}`)
  }
  const onNewPlan = (p, message) => {
    commitPlans({ ...allPlans(), [p.id]: p })
    openPlan(p)
    setSheet(null)
    showToast(message)
  }

  const onExport = async () => {
    try {
      const text = JSON.stringify(makeBackup({ plans: allPlans(), catalog, photos, sizes, guessEdits, movement }))
      const how = await shareOrDownload(text, backupFileName())
      if (how === 'cancelled') return 'Backup cancelled.'
      const now = new Date().toISOString()
      setLastBackupAt(now)
      save('lastBackupAt', now).catch(() => {})
      return how === 'shared' ? 'Backup made. If you chose “Save to Files”, it is in the Files app.' : 'Backup downloaded.'
    } catch (e) {
      return `Could not make the backup: ${e.message}`
    }
  }

  /** catalog.json or a backup file, picked on the first screen or under Plans. */
  const onImportFile = async (file) => {
    let doc
    try { doc = JSON.parse(await file.text()) } catch { return 'Could not read that file.' }
    const kind = identifyFile(doc)
    if (!kind.type) return kind.problem
    if (kind.type === 'photos') {
      if (phase !== 'ready') return 'Load catalog.json first, then the photo pack.'
      const clean = cleanPhotos(doc.photos)
      const { added, replaced } = await storePhotos(clean)
      const known = Object.keys(clean).filter((u) => catalog.items.some((i) => i.upc === u)).length
      return `Photo pack loaded: ${added} new photo${added === 1 ? '' : 's'}${replaced ? `, ${replaced} replaced` : ''}` +
        ` (${known} of ${Object.keys(clean).length} match products in your store data).`
    }
    if (kind.type === 'sizes') {
      if (phase !== 'ready') return 'Load catalog.json first, then the size pack.'
      const clean = cleanSizes(doc.sizes)
      const changed = await storeSizes(clean)
      const known = Object.keys(clean).filter((u) => products.byUpc.has(u)).length
      return `Size pack loaded: ${changed} product${changed === 1 ? '' : 's'} updated (${known} of ${Object.keys(clean).length} are in your store data). Tape measurements on this phone were kept.`
    }
    if (kind.type === 'movement') {
      if (phase !== 'ready') return 'Load catalog.json first, then the sales file.'
      return storeMovement(doc)
    }
    if (kind.type === 'catalog') {
      await save('catalog', doc)
      await askToKeepData()
      setCatalog(doc)
      if (phase !== 'ready') startWith(doc, await load('plans'), await load('currentPlanId'), await load('shelf'))
      setSheet(null)
      return `Store data loaded: ${doc.items.length.toLocaleString()} products.`
    }
    // backup
    const cat = identifyFile(doc.catalog).type === 'catalog' ? doc.catalog : catalog
    if (!cat) return 'This backup has no store data. Load catalog.json first.'
    if (cat !== catalog) { await save('catalog', cat); setCatalog(cat) }
    await askToKeepData()
    const base = phase === 'ready' ? allPlans() : (await load('plans')) || {}
    const { merged, counts } = mergePlans(base, doc.plans)
    if (phase !== 'ready') {
      startWith(cat, merged, await load('currentPlanId'), null)
    } else {
      commitPlans(merged)
      if (merged[plan.id] !== plan) openPlan(merged[plan.id])
    }
    const pics = doc.photos ? await storePhotos(doc.photos) : { added: 0 }
    if (doc.sizes) await storeSizes(doc.sizes)
    if (doc.movement && (!movement || (doc.movement.loadedAt || '') > (movement.loadedAt || ''))) await storeMovement(doc.movement)
    if (doc.guessEdits && !Object.keys(guessEdits).length && Object.keys(doc.guessEdits).length) {
      await save('guessEdits', doc.guessEdits)
      setGuessEdits(doc.guessEdits)
    }
    if (sheet === 'data') setSheet(null)
    return `Backup loaded: ${counts.added} new plan${counts.added === 1 ? '' : 's'}, ${counts.updated} updated` +
      (counts.keptPhone ? `, ${counts.keptPhone} kept because this phone’s copy was newer` : '') +
      (pics.added ? `, ${pics.added} photos added` : '') + '. Nothing was deleted.'
  }

  if (phase === 'loading') return <div className="center-msg">Loading…</div>
  if (phase === 'needData' || sheet === 'data') {
    return <ImportScreen onFile={onImportFile} onCancel={phase === 'ready' ? () => setSheet(null) : null} />
  }

  const missing = plan.shelves.reduce((n, s) => n + s.items.filter((i) => !products.info(i).inCatalog).length, 0)
  const productCount = plan.shelves.reduce((n, s) => n + s.items.filter((i) => i.kind !== 'gap').length, 0)
  const anyGuess = plan.shelves.some((s) => s.items.some((i) => products.isGuess(products.dims(i))))
  const placed = sel && sel.where !== TRAY ? check.byShelf[sel.where].items[sel.index] : null

  return (
    <div className={`app${sel ? ' has-selection' : ''}`}>
      <header className="topbar">
        <button className="title-btn" onClick={() => setSheet('plans')} aria-label="Open plans and backup">
          <span className="title" data-testid="plan-name">{plan.name}</span>
          <span className="muted">{plan.shelves.length} shelves · tap for plans & backup ▾</span>
        </button>
        <div className="topbar-actions">
          <button className="icon-btn labeled" onClick={undo} disabled={!hist.past.length} aria-label="Undo">↶<small>Undo</small></button>
          <button className="icon-btn labeled" onClick={redo} disabled={!hist.future.length} aria-label="Redo">↷<small>Redo</small></button>
        </div>
      </header>

      <main>
        <SectionSummary plan={plan} check={check} anyGuess={anyGuess} missing={missing} productCount={productCount} />

        <section className={`shelf-card${placing ? ' placing' : ''}`} ref={boxRef}>
          <div className="zoom-row">
            <span className="muted small">{placing ? 'Tap a shelf where it goes' : 'Hold a product to drag it'}</span>
            <div className="zoom-btns">
              <button className="icon-btn" onClick={() => setZoom(Math.max(MIN_SCALE, scale / 1.4))} aria-label="Zoom out">−</button>
              <button className="btn small-btn" onClick={() => setZoom(null)} aria-pressed={zoom == null}>Fit</button>
              <button className="icon-btn" onClick={() => setZoom(Math.min(MAX_SCALE, scale * 1.4))} aria-label="Zoom in">+</button>
            </div>
          </div>
          <SectionView
            plan={plan}
            fits={check.byShelf}
            products={products}
            photos={photos}
            scale={scale}
            viewWidth={boxWidth - 4}
            selectedUid={selectedUid}
            activeShelfId={activeShelf.id}
            placing={placing}
            onTapItem={(uid, shelfId) => { setSelectedUid(uid === selectedUid ? null : uid); setActiveShelfId(shelfId); setPlacing(false) }}
            onMove={onMove}
            onTapShelf={(shelfId) => { setActiveShelfId(shelfId); setSelectedUid(null); setPlacing(false) }}
          />
        </section>

        <SectionList plan={plan} fits={check.byShelf} products={products} photos={photos} selectedUid={selectedUid}
          onSelect={(uid, where) => { setSelectedUid(uid); setPlacing(false); if (where !== TRAY) setActiveShelfId(where) }} />
        {plan.note && <p className="muted small note">{plan.note}</p>}
      </main>

      {sel && (
        <SelectedBar
          plan={plan}
          where={sel.where}
          index={sel.index}
          item={sel.item}
          info={products.info(sel.item)}
          dims={products.dims(sel.item)}
          placed={placed}
          placing={placing}
          photo={photos[sel.item.upc]}
          movement={movement && sel.where !== TRAY ? paceText(sales.find((r) => r.upc === sel.item.upc)) : null}
          onEditSize={() => setSheet('size')}
          onPickPhoto={(f) => onPickPhoto(sel.item, f)}
          onRemovePhoto={() => onRemovePhoto(sel.item)}
          onFacings={(n) => act({ type: 'facings', uid: sel.item.uid, facings: n })}
          onHigh={(n) => act({ type: 'high', uid: sel.item.uid, high: n })}
          onGapWidth={(w) => act({ type: 'gapWidth', uid: sel.item.uid, widthIn: w })}
          onStartPlace={() => setPlacing(true)}
          onCancelPlace={() => setPlacing(false)}
          onTakeOff={() => {
            const gap = sel.item.kind === 'gap'
            act({ type: 'takeOff', uid: sel.item.uid }, gap ? 'Empty space removed' : 'Taken off the shelf')
            if (gap) setSelectedUid(null)
          }}
          onDelete={() => { act({ type: 'deleteItem', uid: sel.item.uid }, `Deleted ${products.info(sel.item).description}`); setSelectedUid(null) }}
          onClose={() => { setSelectedUid(null); setPlacing(false) }}
        />
      )}

      <nav className="bottombar">
        <button className="btn primary" onClick={() => setSheet('add')} data-testid="open-add">＋ Add</button>
        <button className="btn" onClick={() => setSheet('plans')}>Plans</button>
        <button className="btn" onClick={() => setSheet('shelf')} aria-label="Shelf">Shelf</button>
        <button className="btn" onClick={() => setSheet('tools')} data-testid="open-tools">Tools</button>
      </nav>

      {sheet === 'add' && (
        <AddSheet index={index} catalog={catalog}
          targetLabel={sel && sel.where !== TRAY ? shelfLabel(plan, sel.where) : shelfLabel(plan, activeShelf.id)}
          onAdd={onAdd} onAddGap={onAddGap} onClose={() => setSheet(null)} />
      )}
      {sheet === 'shelf' && (
        <ShelfSheet plan={plan} shelf={activeShelf} catalog={catalog}
          onSave={(changes, all) => act({ type: 'shelf', shelfId: activeShelf.id, changes, all }, all ? 'Every shelf updated' : 'Shelf updated')}
          onAddShelf={(position) => {
            const id = newId('s')
            act({ type: 'addShelf', position, id }, `Added a shelf at the ${position}`)
            setActiveShelfId(id)
          }}
          onRemoveShelf={(shelfId) => act({ type: 'removeShelf', shelfId }, 'Shelf removed; its products are off the shelf')}
          onClose={() => setSheet(null)}
          onReplaceData={() => setSheet('data')}
          onOpenGuesses={() => setSheet('guesses')} />
      )}
      {sheet === 'size' && sel && (
        <SizeSheet
          key={sel.item.upc}
          info={products.info(sel.item)}
          photo={photos[sel.item.upc]}
          dims={products.dims(sel.item)}
          rec={sizes[sel.item.upc]}
          types={products.types}
          shelfWidthIn={sel.where !== TRAY ? plan.shelves.find((s) => s.id === sel.where).widthIn : activeShelf.widthIn}
          onSave={(rec) => onSaveSize(sel.item.upc, rec)}
          onClose={() => setSheet(null)} />
      )}
      {sheet === 'tools' && (
        <ToolsSheet onPick={setSheet} onClose={() => setSheet(null)} />
      )}
      {sheet === 'print' && (() => {
        const others = Object.values(plans).filter((p) => p.id !== plan.id)
        const base = others.find((p) => p.id === compareId)
        const extraTables = base
          ? [{ title: `Changes from “${base.name}”`, columns: CHANGE_COLUMNS, rows: changeRows(comparePlans(base, plan), products) }]
          : []
        return (
          <PrintSheet plan={plan} check={check} products={products} photos={photos} extraTables={extraTables}
            compareOptions={others} compareId={base ? compareId : null} onCompareId={setCompareId} onClose={() => setSheet(null)} />
        )
      })()}
      {sheet === 'sales' && (
        <MovementSheet movement={movement} rows={sales} tips={tips} pendingCsv={pendingCsv}
          deliveryDays={deliveryDays}
          onDeliveryDays={(d) => { setDeliveryDays(d); save('deliveryDays', d).catch(() => {}) }}
          onFile={onMovementFile}
          onCsvDays={async (days) => {
            const msg = await storeMovement({ source: 'sales file (CSV)', days, items: pendingCsv.items })
            setPendingCsv(null)
            return msg
          }}
          onRemove={async () => { await remove('movement'); setMovement(null); showToast('Sales data removed from this phone') }}
          onSelect={(uid) => {
            const f = findItem(plan, uid)
            setSelectedUid(uid)
            if (f && f.where !== TRAY) setActiveShelfId(f.where)
            setSheet(null)
          }}
          onClose={() => { setPendingCsv(null); setSheet(null) }} />
      )}
      {sheet === 'compare' && (
        <CompareSheet plan={plan} others={Object.values(plans).filter((p) => p.id !== plan.id)}
          compareId={compareId} onCompareId={setCompareId} products={products}
          onSelect={(uid) => {
            const f = findItem(plan, uid)
            setSelectedUid(uid)
            if (f && f.where !== TRAY) setActiveShelfId(f.where)
            setSheet(null)
          }}
          onPrint={() => setSheet('print')} onClose={() => setSheet(null)} />
      )}
      {sheet === 'guesses' && (
        <GuessTableSheet types={products.types} onSave={onSaveGuesses} onClose={() => setSheet(null)} />
      )}
      {sheet === 'plans' && (
        <PlansSheet
          plans={plans} currentId={plan.id} resets={catalog.resets || []} lastBackupAt={lastBackupAt}
          onOpen={onOpenPlan} onDuplicate={onDuplicate} onRename={onRename} onDelete={onDeletePlan}
          onNewBlank={({ shelves, widthIn }) => onNewPlan(newPlan({ name: `New ${shelves}-shelf section`, shelves, widthIn }), 'New empty section')}
          onNewAfi={(r) => onNewPlan(planFromAfi(r), `New plan from AFI ${r.name}`)}
          onExport={onExport} onImportFile={onImportFile} onClose={() => setSheet(null)} />
      )}

      {toast && !sheet && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undoable && <button className="btn" onClick={() => { undo(); setToast(null) }}>Undo</button>}
        </div>
      )}
    </div>
  )
}

function ImportScreen({ onFile, onCancel }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMsg(null)
    const result = await onFile(file).catch((err) => `Could not load it: ${err.message}`)
    setBusy(false)
    setMsg(result)
  }
  return (
    <div className="import">
      <h1>Shelf Planner</h1>
      <p>Plan shelf sets in real inches and see what fits before you move anything.</p>
      <div className="import-card">
        <h2>Load your store data</h2>
        <p>
          Pick <strong>catalog.json</strong> (your store's product list: names, sizes and UPCs, no costs or prices),
          or a <strong>shelf-planner-backup</strong> file from another phone.
        </p>
        <p className="muted">The file stays on this phone. Nothing is uploaded anywhere.</p>
        <label className={`btn primary wide file-btn${busy ? ' busy' : ''}`}>
          {busy ? 'Loading…' : 'Choose file'}
          <input type="file" accept=".json,application/json" onChange={pick} disabled={busy} data-testid="data-file" />
        </label>
        {msg && <p className="error" role="alert">{msg}</p>}
        {onCancel && <button className="btn wide" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
