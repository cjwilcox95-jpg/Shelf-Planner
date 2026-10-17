import { useCallback, useEffect, useRef, useState } from 'react'
import { Sheet } from './Panels.jsx'
import { fmtIn } from '../lib/fit.js'
import { prettyUpc } from '../lib/upc.js'
import { loadReader, matchScan, readOne } from '../lib/barcode.js'
import { FRACTIONS, parseInches, withFraction } from '../lib/tape.js'
import { sourceMark } from '../lib/sizes.js'

const SCAN_EVERY_MS = 180

/**
 * Scan a barcode with the camera (or a photo, or typed digits).
 * mode 'find': show where the product is in the plan, or add it.
 * mode 'measure': type its tape-measured size, save, scan the next one.
 */
export function ScanSheet({ mode: startMode = 'find', products, whereInPlan, targetLabel, onShow, onAdd, onSaveSize, sizes, onClose }) {
  const [mode, setMode] = useState(startMode)
  const [status, setStatus] = useState('Starting the camera…')
  const [camera, setCamera] = useState('starting') // starting | on | off
  const [hit, setHit] = useState(null) // { upc, best, text, info }
  const [typed, setTyped] = useState('')
  const [count, setCount] = useState(0)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const busy = useRef(false)
  const paused = useRef(false)
  const foundRef = useRef(null)

  const found = useCallback((text, format) => {
    const m = matchScan(text, format, (k) => products.byUpc.has(k))
    const upc = m.upc || m.best
    if (!upc) {
      setStatus(`Read ${text}, but that is not a US product barcode. Try the other barcode on the package.`)
      return false
    }
    paused.current = true
    navigator.vibrate?.(40)
    setHit({ upc, inCatalog: !!m.upc, text, info: products.info({ upc }) })
    return true
  }, [products])
  foundRef.current = found // the camera loop always uses the latest, without restarting the camera

  // Camera: read a frame every ~0.2 s until something is found.
  useEffect(() => {
    let stop = false
    let timer = null
    ;(async () => {
      try {
        loadReader() // start loading while the camera starts
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        v.srcObject = stream
        await v.play().catch(() => {})
        await loadReader()
        setCamera('on')
        setStatus('Point at the barcode. Hold steady about 6 inches away.')
        const tick = async () => {
          if (stop) return
          if (!paused.current && !busy.current && v.videoWidth) {
            busy.current = true
            try {
              const c = canvasRef.current
              // the middle band of the picture, where the guide box is
              const w = v.videoWidth
              const h = Math.round(v.videoHeight * 0.6)
              const scale = Math.min(1, 960 / w)
              c.width = Math.round(w * scale)
              c.height = Math.round(h * scale)
              const ctx = c.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(v, 0, (v.videoHeight - h) / 2, w, h, 0, 0, c.width, c.height)
              const r = await readOne(ctx.getImageData(0, 0, c.width, c.height))
              if (r && !paused.current) foundRef.current(r.text, r.format)
            } catch { /* keep trying */ }
            busy.current = false
          }
          timer = setTimeout(tick, SCAN_EVERY_MS)
        }
        tick()
      } catch {
        if (!stop) {
          setCamera('off')
          setStatus('The camera is not available. Allow camera access for this site in Settings, or use a photo or type the numbers below.')
        }
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const fromPhoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setStatus('Reading the photo…')
    try {
      const r = await readOne(f)
      if (!r) setStatus('No barcode found in that photo. Try closer, straight on, with good light.')
      else found(r.text, r.format)
    } catch {
      setStatus('Could not read that photo.')
    }
  }

  const fromTyped = (e) => {
    e.preventDefault()
    if (!found(typed, '')) setStatus('Those numbers are not a UPC. Type all the digits under the barcode.')
    else setTyped('')
  }

  const next = () => {
    setHit(null)
    paused.current = false
    setStatus(camera === 'on' ? 'Point at the next barcode.' : 'Use a photo or type the numbers.')
  }

  const where = hit ? whereInPlan(hit.upc) : null

  return (
    <Sheet title={mode === 'measure' ? 'Measure as you go' : 'Scan a barcode'} onClose={onClose} tall>
      <div className="scan-modes" role="radiogroup" aria-label="What to do after a scan">
        <button type="button" role="radio" aria-checked={mode === 'find'} className={`chip${mode === 'find' ? ' on' : ''}`} onClick={() => setMode('find')}>Find or add</button>
        <button type="button" role="radio" aria-checked={mode === 'measure'} className={`chip${mode === 'measure' ? ' on' : ''}`} onClick={() => setMode('measure')} data-testid="mode-measure">Measure</button>
        {count > 0 && <span className="muted small" data-testid="measured-count">{count} measured</span>}
      </div>

      <div className={`scan-view${hit ? ' small' : ''}${camera === 'off' ? ' off' : ''}`}>
        <video ref={videoRef} playsInline muted aria-label="Camera" />
        {camera === 'on' && !hit && <div className="scan-guide" aria-hidden="true" />}
        <canvas ref={canvasRef} hidden />
      </div>
      {!hit && <p className="scan-status" role="status" data-testid="scan-status">{status}</p>}

      {hit && (
        <div className="scan-hit" data-testid="scan-hit">
          <div className="scan-hit-name">{hit.inCatalog ? hit.info.description : 'Not in your store data'}</div>
          <div className="muted small">{hit.inCatalog && hit.info.size ? `${hit.info.size} · ` : ''}UPC {prettyUpc(hit.upc)}</div>
          {mode === 'find' ? (
            <FindResult hit={hit} where={where} targetLabel={targetLabel} onShow={onShow} onAdd={onAdd}
              onMeasure={() => setMode('measure')} onNext={next} />
          ) : (
            <MeasureForm key={hit.upc} hit={hit} products={products} rec={sizes[hit.upc]}
              onSave={async (rec) => { await onSaveSize(hit.upc, rec); setCount((n) => n + 1); next() }} onSkip={next} />
          )}
        </div>
      )}

      {!hit && (
        <div className="scan-other">
          <label className="btn wide file-btn">
            Use a photo of the barcode
            <input type="file" accept="image/*" onChange={fromPhoto} data-testid="scan-photo" />
          </label>
          <form className="scan-type" onSubmit={fromTyped}>
            <input inputMode="numeric" placeholder="or type the numbers" value={typed} onChange={(e) => setTyped(e.target.value)}
              aria-label="Barcode numbers" data-testid="scan-typed" />
            <button className="btn" disabled={typed.replace(/\D/g, '').length < 6}>Look up</button>
          </form>
        </div>
      )}
    </Sheet>
  )
}

function FindResult({ hit, where, targetLabel, onShow, onAdd, onMeasure, onNext }) {
  return (
    <>
      <p className="scan-where" data-testid="scan-where">
        {where
          ? <>On <strong>{where.label}</strong>, #{where.pos} · {where.facings} facing{where.facings > 1 ? 's' : ''}{where.more ? ` (and ${where.more} more spot${where.more > 1 ? 's' : ''})` : ''}</>
          : 'Not in this plan.'}
      </p>
      <div className="btn-grid two">
        {where
          ? <button className="btn primary" onClick={() => onShow(where.uid)} data-testid="scan-show">Show on shelf</button>
          : <button className="btn primary" onClick={() => onAdd(hit)} data-testid="scan-add">Add to {targetLabel}</button>}
        <button className="btn" onClick={onMeasure}>Measure it</button>
      </div>
      <button className="btn wide" onClick={onNext} data-testid="scan-next">Scan another</button>
    </>
  )
}

const DIMS = [['w', 'Width'], ['h', 'Height'], ['d', 'Depth']]

/** Tape-measure entry: whole inches on the keypad, fractions by tapping 1/4, 1/2... */
function MeasureForm({ hit, products, rec, onSave, onSkip }) {
  const dims = products.dims({ upc: hit.upc })
  const start = (k) => (rec?.[k]?.src === 'measured' ? fmtIn(rec[k].v, 3) : '')
  const [vals, setVals] = useState({ w: start('w'), h: start('h'), d: start('d') })
  const [focus, setFocus] = useState('w')
  const parsed = Object.fromEntries(DIMS.map(([k]) => [k, parseInches(vals[k])]))
  const bad = DIMS.some(([k]) => vals[k].trim() && !(parsed[k] > 0 && parsed[k] < 200))
  const any = DIMS.some(([k]) => parsed[k] > 0)
  const save = () => {
    const next = { ...(rec || {}), updatedAt: new Date().toISOString() }
    for (const [k] of DIMS) if (parsed[k] > 0) next[k] = { v: Math.round(parsed[k] * 1000) / 1000, src: 'measured' }
    onSave(next)
  }
  return (
    <div className="measure-form">
      <p className="muted small">Type whole inches, then tap a fraction. Leave a box empty to keep what is there now.</p>
      {DIMS.map(([k, label]) => (
        <label className="measure-row" key={k}>
          <span>{label}</span>
          <input
            type="text" inputMode="decimal" autoComplete="off" value={vals[k]}
            placeholder={`${sourceMark(dims.source[k])}${fmtIn(dims[k], 2)}`}
            onFocus={() => setFocus(k)} onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            className={vals[k].trim() && !(parsed[k] > 0) ? 'bad' : ''} data-testid={`tape-${k}`}
          />
          <span className="unit">in</span>
          <span className="measure-read">{parsed[k] > 0 ? `= ${fmtIn(parsed[k], 3)}` : ''}</span>
        </label>
      ))}
      <div className="chips fractions" aria-label="Add a fraction">
        {FRACTIONS.map((f) => (
          <button key={f} type="button" className="chip" onMouseDown={(e) => e.preventDefault()}
            onClick={() => setVals({ ...vals, [focus]: withFraction(vals[focus], f) })}>{f}</button>
        ))}
      </div>
      <div className="btn-grid two">
        <button className="btn primary" disabled={!any || bad} onClick={save} data-testid="tape-save">Save, scan next</button>
        <button className="btn" onClick={onSkip}>Skip</button>
      </div>
    </div>
  )
}
