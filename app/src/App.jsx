import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ChevronRight, FolderOpen, LayoutGrid, Pencil, Plus, ScanBarcode, Undo2 } from 'lucide-react'
import SectionView from './components/SectionView.jsx'
import { AddSheet, ConfirmSheet, PlansSheet, SectionSummary, SelectedBar, Sheet, ShelfSheet } from './components/Panels.jsx'
import { MiniMap, ShelfRows, StatusPill, Switcher, TraySheet, neighbourShelf, niceName } from './components/Focus.jsx'
import { checkPlan, fmtIn } from './lib/fit.js'
import { buildIndex } from './lib/search.js'
import {
  TRAY, applyPlanAction, duplicatePlan, findItem, historyReducer, initHistory, newId, newPlan,
  planFromAfi, planFromOldShelf, plansFromAfi, positions, shelfLabel, uniqueUids,
} from './lib/plan.js'
import { makeProducts } from './lib/products.js'
import { askToKeepData, load, loadPhotoIndex, loadPhotos, loadPrefix, remove, removePhoto, save, savePhotos } from './lib/storage.js'
import { cleanPhotos, OWN_PHOTO, processPhoto, toBackupPhoto } from './lib/photos.js'
import { importPhotos, moveOldPhotos } from './lib/photoStore.js'
import { thumbs as thumbCache, useThumbs } from './lib/usePhotos.js'
import { cleanSizes, mergeSizes } from './lib/sizes.js'
import { GuessTableSheet, SizeSheet } from './components/SizeTools.jsx'
import { PrintSheet } from './components/PrintSheet.jsx'
import { ToolsSheet } from './components/ToolsSheet.jsx'
import { CompareSheet } from './components/CompareSheet.jsx'
import { CHANGE_COLUMNS, changeRows, comparePlans } from './lib/compare.js'
import { MovementSheet } from './components/MovementSheet.jsx'
import { aisleRows, makeAisleView, mergeAisles, newAisle, sectionOf, splitAisleView } from './lib/aisle.js'
import { cleanCatalog } from './lib/clean.js'
import { cleanGuessEdits } from './lib/guess.js'
import { ScanSheet } from './components/ScanSheet.jsx'
import { loadReader } from './lib/barcode.js'
import { prettyUpc } from './lib/upc.js'
import { cleanMovement, paceText, parseMovementCsv, salesRows, suggestions } from './lib/movement.js'
import { backupFileName, backupPhotoUpcs, identifyFile, makeBackup, mergePlans, shareOrDownload } from './lib/backup.js'

const MIN_SCALE = 3 // px per inch
const PEEK = 26 // px of the shelves above and below shown around the shelf you are on

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
  const [zoomed, setZoomed] = useState(false) // false = the whole set; true = one shelf with its list
  const [wholeScale, setWholeScale] = useState(null) // px per inch that fits the whole set on the screen
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [ask, setAsk] = useState(null) // { title, text, yes, onYes }: an in-app 'are you sure?'
  const [toast, setToast] = useState(null)
  const [lastBackupAt, setLastBackupAt] = useState(null)
  // which products have a photo: UPC -> { w, h, source, addedAt }. The pictures stay in storage until shown.
  const [photoIndex, setPhotoIndex] = useState({})
  const photoIndexRef = useRef({})
  const [sizes, setSizes] = useState({}) // UPC -> real sizes { w, h, d, type, note }
  const [guessEdits, setGuessEdits] = useState({}) // package type -> edited typical size
  const [boxWidth, setBoxWidth] = useState(360)
  const [compareId, setCompareId] = useState(null) // the plan the open plan is compared with
  const [movement, setMovement] = useState(null) // units sold by UPC (no money), from a sales file
  const [pendingCsv, setPendingCsv] = useState(null) // a CSV waiting for its number of days
  const [deliveryDays, setDeliveryDays] = useState(7)
  const [saveError, setSaveError] = useState(false)
  const [aisles, setAisles] = useState({}) // id -> { id, name, planIds (left to right) }
  const aislesRef = useRef({})
  const boxRef = useRef(null)
  const winRef = useRef(null)
  const layoutKey = useRef('')
  const toastTimer = useRef(null)
  const plan = hist.present

  const commitPlans = useCallback((next) => {
    plansRef.current = next
    setPlans(next)
    save('plans', next).then(() => setSaveError(false)).catch((e) => {
      console.error('save failed', e)
      setSaveError(true) // shown at the top of the screen until a save works again
    })
  }, [])

  const openPlan = useCallback((p) => {
    dispatch({ type: 'open', plan: p })
    setSelectedUid(null)
    setPlacing(false)
    setZoomed(false)
    setDetailsOpen(false)
    setActiveShelfId(p.shelves[p.shelves.length - 1].id)
  }, [])

  const commitAisles = useCallback((next) => {
    aislesRef.current = next
    setAisles(next)
    save('aisles', next).catch(() => setSaveError(true))
  }, [])

  const startWith = useCallback((cat, saved, currentId, oldShelf) => {
    let all = saved && Object.keys(saved).length ? saved : null
    if (!all) {
      const p = oldShelf ? planFromOldShelf(oldShelf) : starterPlan(cat)
      all = { [p.id]: p }
    }
    all = uniqueUids(all).plans // older copies shared product ids with their original
    commitPlans(all)
    const aisle = typeof currentId === 'string' && currentId.startsWith('aisle:') ? aislesRef.current[currentId.slice(6)] : null
    const view = aisle ? makeAisleView(aisle, all) : null
    openPlan(view?.sections.length ? view : all[currentId] || mostRecent(all))
    setPhase('ready')
  }, [commitPlans, openPlan])

  // Load what is saved on this device.
  useEffect(() => {
    (async () => {
      try {
        const [cat, saved, currentId, oldShelf, lastBk] = await Promise.all(
          ['catalog', 'plans', 'currentPlanId', 'shelf', 'lastBackupAt'].map((k) => load(k)))
        setLastBackupAt(lastBk || null)
        const index = await loadPhotoIndex().catch((e) => { console.error('could not read the photo list', e); return {} })
        photoIndexRef.current = index
        setPhotoIndex(index)
        const savedSizes = await loadPrefix('size:').catch(() => ({}))
        setSizes(Object.fromEntries(Object.entries(savedSizes).map(([k, v]) => [k.slice(5), v])))
        setGuessEdits(cleanGuessEdits(await load('guessEdits').catch(() => null)))
        const mv = await load('movement').catch(() => null)
        if (mv) setMovement(cleanMovement(mv))
        setDeliveryDays((await load('deliveryDays').catch(() => null)) || 7)
        const savedAisles = (await load('aisles').catch(() => null)) || {}
        aislesRef.current = savedAisles
        setAisles(savedAisles)
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

  // Fetch the barcode reader in the background once, so scanning also works later without a signal.
  useEffect(() => {
    if (phase !== 'ready') return undefined
    const t = setTimeout(() => { loadReader().catch(() => {}) }, 5000)
    return () => clearTimeout(t)
  }, [phase])

  // Save the open plan after every change.
  useEffect(() => {
    if (phase !== 'ready') return
    if (plan.sections) {
      // an aisle: save each section plan that changed
      const changed = splitAisleView(plan, plansRef.current)
      if (Object.keys(changed).length) commitPlans({ ...plansRef.current, ...changed })
    } else commitPlans({ ...plansRef.current, [plan.id]: plan })
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
  // small photos of every product in the open plan or aisle (shelves and off the shelf), read in one go
  const planUpcs = useMemo(() => [...plan.shelves.flatMap((s) => s.items), ...plan.tray].filter((i) => i.kind !== 'gap').map((i) => i.upc), [plan])
  const thumbs = useThumbs(planUpcs, photoIndex)
  const index = useMemo(() => (catalog ? buildIndex(catalog) : []), [catalog])
  const check = useMemo(() => checkPlan(plan, (item) => products.dims(item)), [plan, products])
  const sales = useMemo(() => (movement ? salesRows(plan, check, products, movement) : []), [plan, check, products, movement])
  const tips = useMemo(() => suggestions(plan, check, sales, { deliveryDays }), [plan, check, sales, deliveryDays])
  const spanIn = plan.sections
    ? Math.max(...plan.shelves.map((s) => (sectionOf(plan, s.id)?.offsetIn || 0) + Math.max(s.widthIn, check.byShelf[s.id].usedIn)))
    : check.widestIn
  const fitScale = Math.max(MIN_SCALE, (boxWidth - 28) / (spanIn + 3))
  const scale = zoomed ? fitScale : Math.min(fitScale, wholeScale ?? fitScale)
  // inches of height that grow with the scale: each row of shelves is as tall as its clearance or tallest product
  const rowsTallestIn = (plan.sections
    ? aisleRows(plan).map((cells) => cells.filter(Boolean).map((c) => c.shelf))
    : plan.shelves.map((s) => [s])
  ).reduce((n, row) => n + Math.max(1, ...row.map((s) => Math.max(s.clearanceIn, ...check.byShelf[s.id].items.map((p) => p.heightIn)))), 0)

  const showToast = useCallback((text, undoable = false) => {
    clearTimeout(toastTimer.current)
    setToast({ text, undoable })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  /** Photos were saved (written: UPC -> { w, h, source, addedAt }): show them. */
  const photosSaved = useCallback((written) => {
    const upcs = Object.keys(written)
    if (!upcs.length) return
    for (const upc of upcs) thumbCache.forget(upc) // a replaced photo: drop the old picture
    photoIndexRef.current = { ...photoIndexRef.current, ...written }
    setPhotoIndex(photoIndexRef.current)
  }, [])

  // Photos saved by the first version of the app (as text in "photo:<upc>") move to the photos store,
  // a batch at a time, once the main screen is up. Safe to stop half way: the next start carries on.
  const moving = useRef(false)
  useEffect(() => {
    if (phase !== 'ready' || moving.current) return
    moving.current = true
    moveOldPhotos({ onSaved: photosSaved }).catch((e) => console.error('could not move the old photos', e))
  }, [phase, photosSaved])

  // let go of the pictures in memory if the app closes
  useEffect(() => () => thumbCache.clear(), [])

  /**
   * Save the photos of a pack or backup on the phone, a few hundred at a time; never deletes a photo.
   * onProgress(text) is told how far it got. Returns { added, replaced, saved, total, outOfSpace }.
   */
  const storePhotos = async (incoming, onProgress) => {
    if (Object.keys(incoming || {}).length > 200) onProgress?.('Loading photos…')
    return importPhotos(photoIndexRef.current, incoming, {
      onSaved: photosSaved,
      onProgress: (done, n) => onProgress?.(`Loading photos… ${done.toLocaleString()} of ${n.toLocaleString()}`),
    })
  }
  const outOfSpaceText = (r) => `Could not save every photo: the phone ran out of space. ${r.saved.toLocaleString()} of ${r.total.toLocaleString()} were saved and are kept; free up space on the phone, then load the file again for the rest.`

  const onPickPhoto = async (item, file) => {
    try {
      const p = await processPhoto(file)
      const rec = { ...p, source: OWN_PHOTO, addedAt: new Date().toISOString() }
      photosSaved(await savePhotos([[item.upc, rec]]))
      showToast('Photo saved for this product')
    } catch (e) {
      showToast(e?.name === 'QuotaExceededError' ? 'Could not save the photo: the phone is out of space.' : e.message || 'Could not use that picture')
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

  const storeMovement = async (doc, { restoring = false } = {}) => {
    const m = cleanMovement(restoring ? doc : { ...doc, loadedAt: new Date().toISOString() })
    await save('movement', m)
    setMovement(m)
    const onPlans = Object.values(plansRef.current).flatMap((p) => p.shelves.flatMap((x) => x.items)).filter((i) => i.kind !== 'gap')
    const found = new Set(onPlans.filter((i) => m.items[i.upc]).map((i) => i.upc)).size
    const total = new Set(onPlans.map((i) => i.upc)).size
    return `Sales file loaded: ${Object.keys(m.items).length.toLocaleString()} products (${found} of the ${total} products in your plans). Units sold only.`
  }

  /** A .json movement file or a .csv export, picked under Tools > Sales help. */
  const onMovementFile = (file) => readMovementFile(file).catch((e) => `Could not load it: ${e.message || e}`)
  const readMovementFile = async (file) => {
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
    await removePhoto(item.upc)
    thumbCache.forget(item.upc)
    const next = { ...photoIndexRef.current }
    delete next[item.upc]
    photoIndexRef.current = next
    setPhotoIndex(next)
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
  const barOpen = !!sel && detailsOpen && !placing // while moving, the shelf heading says what to do instead

  // Remind about backups: never backed up after making changes, or the last one is over a week old.
  const changedSince = (t) => Object.values(plans).some((p) => (p.updatedAt || '') > (t || p.createdAt || ''))
  const backupDue = lastBackupAt ? Date.now() - Date.parse(lastBackupAt) > 7 * 864e5 && changedSince(lastBackupAt) : changedSince(null)

  // Whole set: shrink the drawing until every shelf fits on the screen.
  // One shelf: the drawing becomes a window onto that shelf, with a peek of the shelves above and below.
  useLayoutEffect(() => {
    const win = winRef.current
    const inner = win?.querySelector('.section-inner')
    if (!inner) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Scroll only when the view really changed (whole set / another shelf / another plan), so a person's own
    // scrolling is never undone by an unrelated update such as a message closing.
    const key = `${zoomed}|${plan.id}|${zoomed ? activeShelf.id : ''}`
    const changed = layoutKey.current !== key
    layoutKey.current = key
    if (!zoomed) {
      win.style.height = ''
      const room = win.clientHeight - 8
      const fixedPx = inner.offsetHeight - rowsTallestIn * scale // headings, boards and ruler don't grow
      const want = Math.max(MIN_SCALE, Math.min(fitScale, (room - fixedPx) / rowsTallestIn))
      if (Math.abs(want - scale) > 0.05 && Math.abs(want - (wholeScale ?? 0)) > 0.05) setWholeScale(want)
      if (changed) win.scrollTop = 0
      return
    }
    const row = [...win.querySelectorAll('[data-testid="shelf-row"]')].find((r) => (r.dataset.shelves || '').split(' ').includes(activeShelf.id))
    if (!row) return
    const height = `${Math.min(row.offsetHeight + PEEK * 2, Math.round(window.innerHeight * 0.5))}px`
    if (!changed && win.style.height === height) return
    win.style.height = height
    const top = win.scrollTop + row.getBoundingClientRect().top - win.getBoundingClientRect().top - PEEK
    win.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    // an aisle can be wider than the screen: bring the section you are on into view sideways too
    const sideways = win.querySelector('[data-testid="section-scroll"]')
    const canvas = win.querySelector(`[data-canvas="${activeShelf.id}"]`)
    if (sideways && canvas) {
      const s = sideways.getBoundingClientRect()
      const c = canvas.getBoundingClientRect()
      if (c.right < s.left + 40 || c.left > s.right - 40) { // only when that shelf is (almost) out of sight
        sideways.scrollTo({ left: Math.max(0, sideways.scrollLeft + c.left - s.left - 8), behavior: smooth ? 'smooth' : 'auto' })
      }
    }
    // Runs again when anything changes the size of the drawing or of the room around it: the view, the scale,
    // the width of the screen, the shelves' heights, and the bars that share the screen with the drawing.
  }, [phase, sheet === 'data', zoomed, plan.id, activeShelf.id, plan.shelves.length, plan.tray.length, scale, fitScale, // eslint-disable-line react-hooks/exhaustive-deps
    wholeScale, boxWidth, rowsTallestIn, backupDue, saveError, barOpen])

  // ---------- moving around the set ----------
  /** Work on one shelf (zoomed in). */
  const focusShelf = (shelfId) => { setActiveShelfId(shelfId); setZoomed(true); setPlacing(false) }
  /** Show a product: zoom in to its shelf with its row open. */
  const focusItem = (uid) => {
    const f = findItem(plan, uid)
    setSelectedUid(uid)
    setDetailsOpen(false)
    if (f && f.where !== TRAY) focusShelf(f.where)
  }
  const onStepShelf = (d) => {
    const next = neighbourShelf(plan, activeShelf.id, d)
    if (!next) return
    setActiveShelfId(next.id)
    if (placing) return // moving a product: keep it, so it can be put on this shelf
    setSelectedUid(null)
    setDetailsOpen(false)
  }
  /** The arrow buttons on a product's row. Up and down keep it in the same section and follow it there. */
  const onArrow = (uid, dir) => {
    const f = findItem(plan, uid)
    if (!f || f.where === TRAY) return
    if (dir === 'left' || dir === 'right') {
      act({ type: 'move', uid, to: f.where, insertBefore: dir === 'left' ? f.index - 1 : f.index + 2 })
      return
    }
    const to = neighbourShelf(plan, f.where, dir === 'up' ? 1 : -1)
    if (!to) return
    act({ type: 'move', uid, to: to.id, insertBefore: Math.min(f.index, to.items.length) }, `Moved to ${shelfLabel(plan, to.id)}`)
    setActiveShelfId(to.id)
  }

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
    setDetailsOpen(false)
    focusShelf(shelfId)
    setSheet(null)
  }

  const onAddGap = () => {
    const uid = newId('g')
    const onShelf = sel && sel.where !== TRAY
    const shelfId = onShelf ? sel.where : activeShelf.id
    act({ type: 'addGap', shelfId, index: onShelf ? sel.index + 1 : undefined, uid, widthIn: 2 },
      `Empty space added to ${shelfLabel(plan, shelfId)}`)
    setSelectedUid(uid)
    setDetailsOpen(false)
    focusShelf(shelfId)
    setSheet(null)
  }

  const undo = () => { dispatch({ type: 'undo' }); setPlacing(false); showToast('Undone') }
  const redo = () => { dispatch({ type: 'redo' }); setPlacing(false); showToast('Redone') }

  // ---------- plan actions ----------
  const allPlans = () => (plan.sections ? { ...plansRef.current } : { ...plansRef.current, [plan.id]: plan })

  // ---------- aisles ----------
  const onOpenAisle = (id) => {
    const view = makeAisleView(aislesRef.current[id], plansRef.current)
    if (!view.sections.length) { showToast('The plans in this aisle were deleted.'); return }
    openPlan(view)
    setSheet(null)
    showToast(`Opened ${view.name}`)
  }
  const onNewAisle = (name, planIds) => {
    const a = newAisle(name, planIds)
    commitAisles({ ...aislesRef.current, [a.id]: a })
    onOpenAisle(a.id)
  }
  const onRenameAisle = (id, name) => {
    commitAisles({ ...aislesRef.current, [id]: { ...aislesRef.current[id], name, updatedAt: new Date().toISOString() } })
    if (plan.aisleId === id) openPlan({ ...plan, name })
  }
  const onDeleteAisle = (id) => {
    const a = aislesRef.current[id]
    setAsk({ title: 'Delete this aisle?', text: `Delete the aisle “${a.name}”? Its sections stay as plans.`, yes: 'Delete the aisle', onYes: () => deleteAisle(id) })
  }
  const deleteAisle = (id) => {
    const a = aislesRef.current[id]
    const rest = { ...aislesRef.current }
    delete rest[id]
    commitAisles(rest)
    if (plan.aisleId === id) openPlan(plansRef.current[a.planIds.find((p) => plansRef.current[p])] || mostRecent(plansRef.current))
    showToast(`Deleted the aisle ${a.name}. Its sections are still under Your plans.`)
  }

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
    setAsk({ title: 'Delete this plan?', text: `Delete the plan “${victim.name}”? This cannot be undone.`, yes: 'Delete the plan', onYes: () => deletePlan(id) })
  }
  const deletePlan = (id) => {
    const victim = id === plan.id ? plan : plansRef.current[id]
    const rest = { ...allPlans() }
    delete rest[id]
    // take it out of any aisle; leave the aisle view if it was part of it
    const inAisles = Object.values(aislesRef.current).filter((a) => a.planIds.includes(id))
    if (inAisles.length) {
      const next = { ...aislesRef.current }
      for (const a of inAisles) next[a.id] = { ...a, planIds: a.planIds.filter((p) => p !== id), updatedAt: new Date().toISOString() }
      commitAisles(next)
    }
    if (plan.sections?.some((s) => s.planId === id)) {
      commitPlans(rest)
      openPlan(mostRecent(rest) || newPlan({ name: 'My section' }))
    } else if (id === plan.id) {
      const next = mostRecent(rest) || newPlan({ name: 'My section' })
      rest[next.id] = next
      commitPlans(rest)
      openPlan(next)
    } else commitPlans(rest)
    showToast(`Deleted ${victim.name}`)
  }
  /** Start from an AFI set: one plan, or for a freezer set with several doors, one plan per door shown as an aisle. */
  const onNewAfi = (r) => {
    const { plans: made, aisleName } = plansFromAfi(r)
    if (!aisleName) { onNewPlan(made[0], `New plan from AFI ${r.name}`); return }
    commitPlans({ ...allPlans(), ...Object.fromEntries(made.map((p) => [p.id, p])) })
    const a = newAisle(aisleName, made.map((p) => p.id))
    commitAisles({ ...aislesRef.current, [a.id]: a })
    onOpenAisle(a.id)
    showToast(`New plan from AFI ${r.name}: ${made.length} doors side by side`)
  }

  const onNewPlan = (p, message) => {
    commitPlans({ ...allPlans(), [p.id]: p })
    openPlan(p)
    setSheet(null)
    showToast(message)
  }

  const onExport = async () => {
    try {
      // only photos taken with this phone; store pictures come back from the photo pack files
      const records = await loadPhotos(backupPhotoUpcs(photoIndexRef.current), 'record')
      const photos = {}
      for (const [upc, rec] of records) photos[upc] = await toBackupPhoto(rec)
      const text = JSON.stringify(makeBackup({ plans: allPlans(), catalog, photos, sizes, guessEdits, movement, aisles: Object.values(aislesRef.current) }))
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

  /**
   * catalog.json or a backup file, picked on the first screen or under Plans. Never fails silently.
   * onProgress(text): how far a long load has got (photos).
   */
  const onImportFile = (file, onProgress) => importFile(file, onProgress).catch((e) => `Could not finish loading that file: ${e.message || e}. Nothing on this phone was deleted; try again.`)
  const importFile = async (file, onProgress) => {
    let doc
    try { doc = JSON.parse((await file.text()).replace(/^\uFEFF/, '')) } catch { return 'Could not read that file.' }
    const kind = identifyFile(doc)
    if (!kind.type) return kind.problem
    if (kind.type === 'photos') {
      if (phase !== 'ready') return 'Load catalog.json first, then the photo pack.'
      await askToKeepData() // many photos: ask the phone not to clear them when space runs low
      const clean = cleanPhotos(doc.photos)
      const known = Object.keys(clean).filter((u) => products.byUpc.has(u)).length
      const r = await storePhotos(clean, onProgress)
      if (r.outOfSpace) return outOfSpaceText(r)
      return `Photo pack loaded: ${r.added} new photo${r.added === 1 ? '' : 's'}${r.replaced ? `, ${r.replaced} replaced` : ''}` +
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
      const cat = cleanCatalog(doc)
      await save('catalog', cat)
      await askToKeepData()
      setCatalog(cat)
      if (phase !== 'ready') startWith(cat, await load('plans'), await load('currentPlanId'), await load('shelf'))
      const msg = `Store data loaded: ${cat.items.length.toLocaleString()} products.`
      if (phase === 'ready') showToast(msg) // the sheet closes, so say it on the main screen
      setSheet(null)
      return msg
    }
    // backup
    // Store data: the backup's copy is used only when this phone has none, or the backup's is newer.
    const inBackup = identifyFile(doc.catalog).type === 'catalog' ? cleanCatalog(doc.catalog) : null
    const useBackupCat = inBackup && (!catalog || (inBackup.built || '') > (catalog.built || ''))
    const cat = useBackupCat ? inBackup : catalog
    if (!cat) return 'This backup has no store data. Load catalog.json first.'
    if (useBackupCat) { await save('catalog', cat); setCatalog(cat) }
    await askToKeepData()
    const base = phase === 'ready' ? allPlans() : (await load('plans')) || {}
    const { merged: mergedRaw, counts } = mergePlans(base, doc.plans)
    const merged = uniqueUids(mergedRaw, phase === 'ready' ? (plan.sections ? plan.sections.map((s) => s.planId) : [plan.id]) : []).plans
    if (Array.isArray(doc.aisles) && doc.aisles.length) {
      const base = phase === 'ready' ? aislesRef.current : (await load('aisles')) || {}
      commitAisles(mergeAisles(base, doc.aisles))
    }
    if (phase !== 'ready') {
      startWith(cat, merged, await load('currentPlanId'), null)
    } else {
      commitPlans(merged)
      if (plan.sections) openPlan(makeAisleView(aislesRef.current[plan.aisleId], merged))
      else if (merged[plan.id] !== plan) openPlan(merged[plan.id])
    }
    const pics = doc.photos ? await storePhotos(doc.photos, onProgress) : { added: 0 }
    if (doc.sizes) await storeSizes(doc.sizes)
    if (doc.movement?.items) {
      const newer = !movement || [doc.movement.to || '', doc.movement.loadedAt || ''].join() > [movement.to || '', movement.loadedAt || ''].join()
      if (newer) await storeMovement(doc.movement, { restoring: true })
    }
    const incomingGuesses = cleanGuessEdits(doc.guessEdits)
    if (!Object.keys(guessEdits).length && Object.keys(incomingGuesses).length) {
      await save('guessEdits', incomingGuesses)
      setGuessEdits(incomingGuesses)
    }
    if (sheet === 'data') setSheet(null)
    return `Backup loaded: ${counts.added} new plan${counts.added === 1 ? '' : 's'}, ${counts.updated} updated` +
      (counts.keptPhone ? `, ${counts.keptPhone} kept because this phone’s copy was newer` : '') +
      (pics.added ? `, ${pics.added} photos added` : '') +
      (useBackupCat && catalog ? ', store data updated to the backup’s newer copy' : '') + '. Nothing was deleted.' +
      (pics.outOfSpace ? ` ${outOfSpaceText(pics)}` : '')
  }

  if (phase === 'loading') return <div className="center-msg">Loading…</div>
  if (phase === 'needData' || sheet === 'data') {
    return <ImportScreen onFile={onImportFile} onCancel={phase === 'ready' ? () => setSheet(null) : null} />
  }

  const missing = plan.shelves.reduce((n, s) => n + s.items.filter((i) => !products.info(i).inCatalog).length, 0)
  const productCount = plan.shelves.reduce((n, s) => n + s.items.filter((i) => i.kind !== 'gap').length, 0)
  const anyGuess = plan.shelves.some((s) => s.items.some((i) => products.isGuess(products.dims(i))))
  const placed = sel && sel.where !== TRAY ? check.byShelf[sel.where].items[sel.index] : null

  const focusFit = check.byShelf[activeShelf.id]
  const subLine = plan.sections
    ? `Aisle · ${plan.sections.length} sections`
    : `${Number((Math.max(...plan.shelves.map((s) => s.widthIn)) / 12).toFixed(1))} ft · ${plan.shelves.length} shelves`

  return (
    <div className={`app d-app${zoomed ? ' zoomed' : ' whole'}`}>
      <header className="appbar d-bar">
        <div className="appbar-title">
          <span className="title" data-testid="plan-name">{plan.name}</span>
          <span className="appbar-sub">
            {subLine}{plan.tray.length > 0 ? ` · ${plan.tray.length} off the shelf` : ''}
          </span>
        </div>
        <StatusPill check={check} onClick={() => setSheet('status')} />
      </header>

      {saveError && (
        <div className="save-error" role="alert" data-testid="save-error">
          Could not save on this phone (storage may be full). Export a backup now so nothing is lost.
          <button className="btn" onClick={async () => showToast(await onExport())}>Export backup</button>
        </div>
      )}

      <main className="stage" ref={boxRef}>
        <div className={`d-window${placing && sel ? ' placing' : ''}`} ref={winRef} data-testid="d-window"
          onTouchStart={(e) => { winRef.current.swipeY = e.touches.length === 1 ? e.touches[0].clientY : null; winRef.current.dragged = false }}
          onTouchEnd={(e) => {
            const y0 = winRef.current.swipeY
            winRef.current.swipeY = null
            if (!zoomed || placing || y0 == null || winRef.current.dragged) return // a drag is not a swipe
            const dy = e.changedTouches[0].clientY - y0
            if (Math.abs(dy) > 50) onStepShelf(dy > 0 ? 1 : -1) // pull down = the shelf above
          }}>
          <SectionView
            plan={plan}
            fits={check.byShelf}
            products={products}
            photoIndex={photoIndex}
            thumbs={thumbs}
            scale={scale}
            viewWidth={boxWidth - 4}
            selectedUid={selectedUid}
            activeShelfId={activeShelf.id}
            focusShelfId={zoomed ? activeShelf.id : null}
            compact
            placing={placing}
            onTapItem={(uid, shelfId) => {
              if (!zoomed) { focusItem(uid); return }
              setSelectedUid(uid === selectedUid ? null : uid)
              setDetailsOpen(false)
              setActiveShelfId(shelfId)
              setPlacing(false)
            }}
            onMove={onMove}
            onDragStart={() => { if (winRef.current) winRef.current.dragged = true }}
            onTapShelf={(shelfId) => { setSelectedUid(null); setDetailsOpen(false); focusShelf(shelfId) }}
          />
        </div>

        {zoomed && (
          <>
            {placing && sel && (
              <div className="d-head placing-head" role="status" data-testid="placing-head">
                <span className="placing-text">
                  <strong>Tap a shelf where it should go.</strong>
                  <span>Moving {niceName(products.info(sel.item).description)} · or use ▲ ▼</span>
                </span>
                <button className="btn" onClick={() => setPlacing(false)}>Cancel</button>
              </div>
            )}
            <div className="d-head" hidden={placing && !!sel}>
              <b data-testid="focus-name">{shelfLabel(plan, activeShelf.id)}</b>
              <span className={`d-head-left${focusFit.isOver ? ' warn' : ''}`} data-testid="focus-left">
                {focusFit.isOver ? `${fmtIn(focusFit.overIn)} in over` : `${fmtIn(focusFit.remainingIn)} in left`} of {fmtIn(activeShelf.widthIn)}
              </span>
              <button className="icon-btn ghost d-head-edit" onClick={() => setSheet('shelf')} data-testid="open-shelf" aria-label="Shelf size">
                <Pencil size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="d-list" data-testid="item-list">
              <ShelfRows plan={plan} shelf={activeShelf} fit={focusFit} products={products} thumbs={thumbs} selectedUid={selectedUid}
                onSelect={(uid) => { setSelectedUid(uid); setDetailsOpen(false); setPlacing(false) }}
                onFacings={(uid, n) => act({ type: 'facings', uid, facings: n })}
                onGapWidth={(uid, w) => act({ type: 'gapWidth', uid, widthIn: w })}
                onMove={onArrow}
                onTakeOff={(uid) => {
                  const gap = findItem(plan, uid)?.item.kind === 'gap'
                  act({ type: 'takeOff', uid }, gap ? 'Empty space removed' : 'Taken off the shelf')
                  setSelectedUid(null)
                  setDetailsOpen(false)
                  setPlacing(false)
                }}
                onDetails={(uid) => { setSelectedUid(uid); setDetailsOpen(true) }} />
              {plan.tray.length > 0 && (
                <button className="tray-link" onClick={() => setSheet('tray')} data-testid="open-tray">
                  <span>{plan.tray.length} off the shelf</span><ChevronRight size={20} aria-hidden="true" />
                </button>
              )}
              {plan.note && <p className="muted small note">{plan.note}</p>}
            </div>
          </>
        )}
      </main>

      {barOpen && (
        <SelectedBar
          plan={plan}
          where={sel.where}
          index={sel.index}
          item={sel.item}
          info={products.info(sel.item)}
          dims={products.dims(sel.item)}
          placed={placed}
          placing={placing}
          photo={photoIndex[sel.item.upc]}
          thumb={thumbs[sel.item.upc]}
          movement={movement && sel.where !== TRAY ? paceText(sales.find((r) => r.upc === sel.item.upc)) : null}
          onEditSize={() => setSheet('size')}
          onPickPhoto={(f) => onPickPhoto(sel.item, f)}
          onRemovePhoto={() => onRemovePhoto(sel.item)}
          onFacings={(n) => act({ type: 'facings', uid: sel.item.uid, facings: n })}
          onHigh={(n) => act({ type: 'high', uid: sel.item.uid, high: n })}
          onGapWidth={(w) => act({ type: 'gapWidth', uid: sel.item.uid, widthIn: w })}
          onStartPlace={() => { setPlacing(true); setDetailsOpen(false) }}
          onCancelPlace={() => setPlacing(false)}
          onTakeOff={() => {
            const gap = sel.item.kind === 'gap'
            act({ type: 'takeOff', uid: sel.item.uid }, gap ? 'Empty space removed' : 'Taken off the shelf')
            setSelectedUid(null)
            setDetailsOpen(false)
          }}
          onDelete={() => { act({ type: 'deleteItem', uid: sel.item.uid }, `Deleted ${products.info(sel.item).description}`); setSelectedUid(null); setDetailsOpen(false) }}
          onClose={() => { setDetailsOpen(false); setPlacing(false) }}
        />
      )}

      <Switcher plan={plan} activeShelfId={activeShelf.id} zoomed={zoomed} onStep={onStepShelf} onZoomIn={() => focusShelf(activeShelf.id)}>
        <MiniMap plan={plan} fits={check.byShelf} products={products} activeShelfId={activeShelf.id}
          onClick={() => { setZoomed(false); setSelectedUid(null); setDetailsOpen(false); setPlacing(false) }} />
      </Switcher>

      <nav className="tabbar d-tabs" aria-label="Main">
        <button className="tab" onClick={() => setSheet('plans')} aria-label="Plans" data-testid="open-plans">
          <FolderOpen size={24} aria-hidden="true" /><span>Plans</span>
          {backupDue && <i className="tab-dot" data-testid="backup-dot" aria-label="Not backed up" />}
        </button>
        <button className="tab" onClick={undo} disabled={!hist.past.length} aria-label="Undo" data-testid="undo">
          <Undo2 size={24} aria-hidden="true" /><span>Undo</span>
        </button>
        <button className="tab scan" onClick={() => setSheet('scan')} data-testid="open-scan-bar" aria-label="Scan">
          <span className="scan-bubble"><ScanBarcode size={28} aria-hidden="true" /></span><span>Scan</span>
        </button>
        <button className="tab" onClick={() => setSheet('add')} data-testid="open-add" aria-label="Add">
          <Plus size={24} aria-hidden="true" /><span>Add</span>
        </button>
        <button className="tab" onClick={() => setSheet('tools')} data-testid="open-tools" aria-label="Tools">
          <LayoutGrid size={24} aria-hidden="true" /><span>Tools</span>
        </button>
      </nav>

      {sheet === 'status' && (
        <Sheet title="This section" onClose={() => setSheet(null)}>
          <SectionSummary plan={plan} check={check} anyGuess={anyGuess} missing={missing} productCount={productCount} />
          {plan.tray.length > 0 && <button className="btn wide" onClick={() => setSheet('tray')} data-testid="status-tray">Off the shelf ({plan.tray.length})</button>}
          {plan.note && <p className="muted small note">{plan.note}</p>}
        </Sheet>
      )}
      {sheet === 'tray' && (
        <TraySheet plan={plan} products={products} thumbs={thumbs} targetLabel={shelfLabel(plan, activeShelf.id)}
          onPut={(uid) => {
            act({ type: 'move', uid, to: activeShelf.id, insertBefore: activeShelf.items.length }, `Put on ${shelfLabel(plan, activeShelf.id)}`)
            setSelectedUid(uid)
            setDetailsOpen(false)
            focusShelf(activeShelf.id)
            setSheet(null) // close the list so you see it land on the shelf
          }}
          onDelete={(uid) => act({ type: 'deleteItem', uid }, `Deleted ${products.info(findItem(plan, uid).item).description}`)}
          onClose={() => setSheet(null)} />
      )}

      {sheet === 'add' && (
        <AddSheet index={index} catalog={catalog} photoIndex={photoIndex}
          inPlan={(() => {
            const m = new Map()
            for (const s of [...plan.shelves].reverse()) {
              const posOf = positions(s.items)
              for (const i of s.items) if (i.kind !== 'gap' && !m.has(i.upc)) m.set(i.upc, `${shelfLabel(plan, s.id)}, #${posOf.get(i.uid)}`)
            }
            for (const i of plan.tray) if (!m.has(i.upc)) m.set(i.upc, 'off the shelf')
            return m
          })()}
          targetLabel={sel && sel.where !== TRAY ? shelfLabel(plan, sel.where) : shelfLabel(plan, activeShelf.id)}
          onAdd={onAdd} onAddGap={onAddGap} onScan={() => setSheet('scan')} onClose={() => setSheet(null)} />
      )}
      {sheet === 'shelf' && (
        <ShelfSheet plan={plan} shelf={activeShelf} catalog={catalog} inAisle={!!plan.sections}
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
          photo={photoIndex[sel.item.upc]}
          thumb={thumbs[sel.item.upc]}
          dims={products.dims(sel.item)}
          rec={sizes[sel.item.upc]}
          types={products.types}
          shelfWidthIn={sel.where !== TRAY ? plan.shelves.find((s) => s.id === sel.where).widthIn : activeShelf.widthIn}
          onSave={(rec) => onSaveSize(sel.item.upc, rec)}
          onClose={() => setSheet(null)} />
      )}
      {sheet === 'tools' && (
        <ToolsSheet onPick={setSheet} inAisle={!!plan.sections} onClose={() => setSheet(null)}
          canRedo={hist.future.length > 0} onRedo={() => { redo(); setSheet(null) }} />
      )}
      {sheet === 'print' && (() => {
        const others = plan.sections ? [] : Object.values(plans).filter((p) => p.id !== plan.id)
        const base = others.find((p) => p.id === compareId)
        const sections = plan.sections
          ? plan.sections.map((sec) => plansRef.current[sec.planId]).filter(Boolean)
            .map((p) => ({ plan: p, check: checkPlan(p, (item) => products.dims(item)) }))
          : null
        const extraTables = base
          ? [{ title: `Changes from “${base.name}”`, columns: CHANGE_COLUMNS, rows: changeRows(comparePlans(base, plan), products) }]
          : []
        return (
          <PrintSheet plan={plan} check={check} products={products} photoIndex={photoIndex} extraTables={extraTables}
            compareOptions={others} compareId={base ? compareId : null} onCompareId={setCompareId} sections={sections} onClose={() => setSheet(null)} />
        )
      })()}
      {(sheet === 'scan' || sheet === 'measure') && (
        <ScanSheet
          mode={sheet === 'measure' ? 'measure' : 'find'}
          products={products} sizes={sizes}
          targetLabel={sel && sel.where !== TRAY ? shelfLabel(plan, sel.where) : shelfLabel(plan, activeShelf.id)}
          whereInPlan={(upc) => {
            const spots = plan.shelves.flatMap((s) => {
              const posOf = positions(s.items)
              return s.items.filter((i) => i.upc === upc && i.kind !== 'gap')
                .map((i) => ({ uid: i.uid, label: shelfLabel(plan, s.id), pos: posOf.get(i.uid), facings: i.facings }))
            }).reverse() // top shelf first
            if (spots.length) return { ...spots[0], more: spots.length - 1 }
            return plan.tray.some((i) => i.upc === upc) ? { offShelf: true } : null
          }}
          onShowTray={() => setSheet('tray')}
          onShow={(uid) => { focusItem(uid); setSheet(null) }}
          onAdd={(hit) => onAdd(hit.inCatalog ? products.byUpc.get(hit.upc) : { upc: hit.upc, description: `UPC ${prettyUpc(hit.upc)}`, size: '' })}
          onSaveSize={onSaveSize}
          onClose={() => setSheet(null)} />
      )}
      {sheet === 'sales' && (
        <MovementSheet movement={movement} rows={sales} tips={tips} pendingCsv={pendingCsv}
          deliveryDays={deliveryDays}
          onDeliveryDays={(d) => { setDeliveryDays(d); save('deliveryDays', d).catch(() => {}) }}
          onFile={onMovementFile}
          onCsvDays={async (days) => {
            const msg = await storeMovement({ source: 'sales file (CSV)', days, items: pendingCsv.items })
              .catch((e) => `Could not save the sales file on this phone: ${e.message || e}`)
            setPendingCsv(null)
            return msg
          }}
          onRemove={async () => { await remove('movement'); setMovement(null); showToast('Sales data removed from this phone') }}
          onSelect={(uid) => { focusItem(uid); setSheet(null) }}
          onClose={() => { setPendingCsv(null); setSheet(null) }} />
      )}
      {sheet === 'compare' && (
        <CompareSheet plan={plan} others={Object.values(plans).filter((p) => p.id !== plan.id)}
          onCopyNow={() => {
            const original = plan.id
            onDuplicate(original)
            setCompareId(original)
            setSheet('compare')
          }}
          compareId={compareId} onCompareId={setCompareId} products={products}
          onSelect={(uid) => { focusItem(uid); setSheet(null) }}
          onPrint={() => setSheet('print')} onClose={() => setSheet(null)} />
      )}
      {sheet === 'guesses' && (
        <GuessTableSheet types={products.types} onSave={onSaveGuesses} onClose={() => setSheet(null)} />
      )}
      {sheet === 'plans' && (
        <PlansSheet
          plans={plans} currentId={plan.id} resets={catalog.resets || []} lastBackupAt={lastBackupAt} backupDue={backupDue}
          photoCount={Object.keys(photoIndex).length}
          aisles={aisles} currentAisleId={plan.aisleId || null}
          onOpenAisle={onOpenAisle} onNewAisle={onNewAisle} onRenameAisle={onRenameAisle} onDeleteAisle={onDeleteAisle}
          onOpen={onOpenPlan} onDuplicate={onDuplicate} onRename={onRename} onDelete={onDeletePlan}
          onNewBlank={({ shelves, widthIn }) => onNewPlan(newPlan({ name: `New ${shelves}-shelf section`, shelves, widthIn }), 'New empty section')}
          onNewAfi={onNewAfi}
          onExport={onExport} onImportFile={onImportFile} onClose={() => setSheet(null)} />
      )}

      {ask && <ConfirmSheet {...ask} onClose={() => setAsk(null)} />}

      {toast && (!sheet || sheet === 'tray') && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undoable && <button className="btn" onClick={undo}>Undo</button>}
        </div>
      )}
    </div>
  )
}

function ImportScreen({ onFile, onCancel }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // "Loading photos… 400 of 960" while a backup's photos load
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMsg(null)
    setProgress(null)
    const result = await onFile(file, setProgress).catch((err) => `Could not load it: ${err.message}`)
    setBusy(false)
    setProgress(null)
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
          {busy ? progress || 'Loading…' : 'Choose file'}
          <input type="file" accept=".json,application/json" onChange={pick} disabled={busy} data-testid="data-file" />
        </label>
        {msg && <p className="error" role="alert">{msg}</p>}
        {onCancel && <button className="btn wide" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
