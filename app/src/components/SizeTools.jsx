import { useEffect, useRef, useState } from 'react'
import { Sheet } from './Panels.jsx'
import { fmtIn } from '../lib/fit.js'
import { prettyUpc } from '../lib/upc.js'
import { measureFromPhoto, SOURCE_LABEL } from '../lib/sizes.js'
import { FRACTIONS, parseInches, withFraction } from '../lib/tape.js'
import { useFullPhoto } from '../lib/usePhotos.js'

const CHIP_AUTO = { afi: 'AFI', afiEstimate: 'AFI estimate', guess: 'guess' }

const DIMS = [
  { k: 'w', label: 'Width (side to side, facing you)' },
  { k: 'h', label: 'Height' },
  { k: 'd', label: 'Depth (front to back)' },
]

/**
 * Edit one product's real size. Saved for the product (by UPC), so it changes everywhere it is used.
 */
export function SizeSheet({ info, photo, thumb, dims, rec, types, shelfWidthIn, onSave, onClose }) {
  const photoUrl = useFullPhoto(info.upc, photo) || thumb // the small copy until the photo is read
  // 'auto' = no size of your own: AFI's size when AFI has one, otherwise the guess
  const autoSrc = (k) => (dims.afi?.[k] > 0 ? (k === 'd' ? 'afiEstimate' : 'afi') : 'guess')
  const autoValue = (k) => (dims.afi?.[k] > 0 ? dims.afi[k] : dims.guess[k])
  const start = (k) => ({ value: String(dims[k]), src: ['measured', 'photo'].includes(dims.source[k]) ? dims.source[k] : 'auto' })
  const [form, setForm] = useState({ w: start('w'), h: start('h'), d: start('d') })
  const [type, setType] = useState(rec?.type || '')
  const [note, setNote] = useState(rec?.note || '')
  const [measuring, setMeasuring] = useState(false)
  const [focus, setFocus] = useState('w')
  const inches = (k) => parseInches(form[k].value)

  const setValue = (k, value) =>
    setForm({ ...form, [k]: { value, src: form[k].src === 'auto' ? 'measured' : form[k].src } })
  const setSrc = (k, src) =>
    setForm({ ...form, [k]: { value: src === 'auto' ? String(autoValue(k)) : form[k].value, src } })

  const valid = DIMS.every(({ k }) => form[k].src === 'auto' || (inches(k) > 0 && inches(k) < 200))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    const next = { updatedAt: new Date().toISOString() }
    for (const { k } of DIMS) if (form[k].src !== 'auto') next[k] = { v: Math.round(inches(k) * 1000) / 1000, src: form[k].src }
    if (type) next.type = type
    if (note.trim()) next.note = note.trim()
    const empty = !DIMS.some(({ k }) => next[k]) && !next.type && !next.note
    setSaving(true)
    setError('')
    try {
      await onSave(empty ? null : next) // close only once it is really saved on the phone
      onClose()
    } catch (e) {
      setError(`Could not save it on this phone (${e.message || e}). Try again, or export a backup.`)
      setSaving(false)
    }
  }

  if (measuring) {
    return (
      <PhotoMeasure
        shelfWidthIn={shelfWidthIn}
        onClose={() => setMeasuring(false)}
        onUse={({ w, h }) => {
          setForm({
            ...form,
            w: w ? { value: String(Math.round(w * 4) / 4), src: 'photo' } : form.w,
            h: h ? { value: String(Math.round(h * 4) / 4), src: 'photo' } : form.h,
          })
          setMeasuring(false)
        }}
      />
    )
  }

  return (
    <Sheet title="Size & notes" onClose={onClose} tall>
      <div className="size-head">
        {photoUrl ? <img src={photoUrl} alt="" className="size-thumb" /> : <div className="size-thumb empty">no photo</div>}
        <div>
          <strong>{info.description}</strong>
          <div className="muted small">{info.size}{info.pack ? ` · pack ${info.pack}` : ''} · UPC {prettyUpc(info.upc)}</div>
          <div className="muted small">Saved for this product everywhere it is used.</div>
        </div>
      </div>

      {DIMS.map(({ k, label }) => (
        <div className="field" key={k}>
          <span>{label}</span>
          <div className="field-row">
            <input
              type="text" inputMode="decimal" autoComplete="off"
              value={form[k].value} className={form[k].src === 'auto' ? 'is-guess' : ''}
              onFocus={() => setFocus(k)} onChange={(e) => setValue(k, e.target.value)} aria-label={label} data-testid={`size-${k}`}
            />
            <span className="unit">in</span>
            {/\//.test(form[k].value) && inches(k) > 0 && <span className="measure-read">= {fmtIn(inches(k), 3)}</span>}
          </div>
          <div className="chips" role="radiogroup" aria-label={`Where the ${label.toLowerCase()} came from`}>
            {['measured', 'photo', 'auto'].map((src) => (
              <button type="button" key={src} role="radio" aria-checked={form[k].src === src}
                className={`chip${form[k].src === src ? ' on' : ''}`} onClick={() => setSrc(k, src)}>
                {src === 'auto' ? CHIP_AUTO[autoSrc(k)] : SOURCE_LABEL[src]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="chips fractions" aria-label="Add a fraction to the box you are typing in">
        {FRACTIONS.map((f) => (
          <button key={f} type="button" className="chip" onMouseDown={(e) => e.preventDefault()}
            onClick={() => setValue(focus, withFraction(form[focus].src === 'auto' ? '' : form[focus].value, f))}>{f}</button>
        ))}
      </div>
      <button className="btn wide" onClick={() => setMeasuring(true)} data-testid="open-measure">Measure from a photo…</button>

      <label className="field">
        <span>Package type (used for guesses)</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className="select">
          <option value="">Automatic ({types.find((t) => t.id === dims.type)?.label || dims.type})</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea className="notes" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. new bottle shape since 2025, sits 3 deep" />
      </label>
      <button className="btn primary wide" onClick={save} disabled={!valid || saving} data-testid="save-size">{saving ? 'Saving…' : 'Save'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">~ = guess · ≈ = from photo · no mark = measured with a tape.</p>
    </Sheet>
  )
}

/** Edit the table of typical sizes that every guess is based on. */
export function GuessTableSheet({ types, onSave, onClose }) {
  const [rows, setRows] = useState(() => Object.fromEntries(types.map((t) => [t.id, { ...t.ref }])))
  const set = (id, k, v) => setRows({ ...rows, [id]: { ...rows[id], [k]: v } })
  // every box must hold a number (W, H, D above 0; "at oz" 0 or more), so a blank box never quietly undoes an edit
  const okRow = (r) => ['w', 'h', 'd'].every((k) => String(r[k]).trim() !== '' && Number(r[k]) > 0 && Number(r[k]) < 100) &&
    String(r.oz).trim() !== '' && Number(r.oz) >= 0
  const badRows = types.filter((t) => !okRow(rows[t.id])).map((t) => t.label)
  const save = () => {
    if (badRows.length) return
    const edits = {}
    for (const t of types) {
      const r = rows[t.id]
      const nums = { oz: Number(r.oz), w: Number(r.w), h: Number(r.h), d: Number(r.d) }
      const orig = t.original || t.ref
      if (['oz', 'w', 'h', 'd'].some((k) => nums[k] !== orig[k])) edits[t.id] = nums
    }
    onSave(edits)
    onClose()
  }
  return (
    <Sheet title="Default size guesses" onClose={onClose} tall>
      <p className="muted small">
        Every product without a real size gets a guess: a typical product of its package type, scaled by its size
        (twice the ounces is about 1.26 times bigger each way). Change a row to change every guess of that type.
        An “at oz” of 0 means that type is guessed the same size whatever it holds (dye boxes, pod bags, sheets).
      </p>
      <div className="guess-table">
        {types.map((t) => (
          <div className="guess-row" key={t.id}>
            <strong>{t.label}{t.edited ? ' (edited)' : ''}</strong>
            <div className="guess-fields">
              {['oz', 'w', 'h', 'd'].map((k) => (
                <label key={k}>
                  <span>{k === 'oz' ? 'at oz' : k.toUpperCase()}</span>
                  <input type="number" inputMode="decimal" step="0.25" value={rows[t.id][k]}
                    onChange={(e) => set(t.id, k, e.target.value)} data-testid={`guess-${t.id}-${k}`} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {badRows.length > 0 && <p className="error" role="alert">Fill in every box for: {badRows.join(', ')}.</p>}
      <button className="btn primary wide" onClick={save} disabled={badRows.length > 0} data-testid="save-guesses">Save guesses</button>
      <button className="btn wide" onClick={() => { onSave({}); onClose() }}>Reset all to the original guesses</button>
    </Sheet>
  )
}

const STEPS = {
  ref: 'Tap both ends of the thing you know the length of.',
  width: 'Now tap the left edge and the right edge of the product.',
  height: 'Optional: tap the top and the bottom of the product.',
  done: 'Done. Check the numbers, then use them.',
}

/**
 * Measure from a photo: tap two ends of something of known length (the shelf, a dollar bill),
 * then the product's edges. Works best with the phone held straight and level with the product.
 */
export function PhotoMeasure({ shelfWidthIn = 48, onUse, onClose }) {
  const [src, setSrc] = useState(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [zoom, setZoom] = useState(1)
  const [refIn, setRefIn] = useState(String(shelfWidthIn))
  const [pts, setPts] = useState([]) // in photo pixels: ref a, ref b, width a, width b, height a, height b
  const imgRef = useRef(null)
  const down = useRef(null)

  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  const step = pts.length < 2 ? 'ref' : pts.length < 4 ? 'width' : pts.length < 6 ? 'height' : 'done'
  const w = pts.length >= 4 ? measureFromPhoto(pts[0], pts[1], Number(refIn), pts[2], pts[3]) : null
  const h = pts.length >= 6 ? measureFromPhoto(pts[0], pts[1], Number(refIn), pts[4], pts[5]) : null

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSrc(URL.createObjectURL(f))
    setPts([])
    setZoom(1)
  }
  const onDown = (e) => { down.current = { x: e.clientX, y: e.clientY } }
  const onUp = (e) => {
    const d = down.current
    down.current = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || pts.length >= 6) return // a scroll, not a tap
    const r = imgRef.current.getBoundingClientRect()
    setPts([...pts, { x: ((e.clientX - r.left) / r.width) * natural.w, y: ((e.clientY - r.top) / r.height) * natural.h }])
  }
  const colors = ['#f2b705', '#f2b705', '#1d5c87', '#1d5c87', '#b3261e', '#b3261e']
  const dot = Math.max(natural.w, natural.h) / 160

  return (
    <Sheet title="Measure from a photo" onClose={onClose} tall>
      {!src ? (
        <>
          <p>
            Take a straight-on photo with the product and something you know the length of, such as the whole shelf
            (its width) or a dollar bill (6.14 in) held against the product.
          </p>
          <label className="btn primary wide file-btn">
            Take or choose a photo
            <input type="file" accept="image/*" onChange={pick} data-testid="measure-photo" />
          </label>
        </>
      ) : (
        <>
          <div className="measure-ref">
            <span>Known length</span>
            <input type="number" inputMode="decimal" value={refIn} onChange={(e) => setRefIn(e.target.value)} aria-label="Known length in inches" />
            <span className="unit">in</span>
            <button type="button" className="chip" onClick={() => setRefIn(String(shelfWidthIn))}>Shelf {fmtIn(shelfWidthIn)}</button>
            <button type="button" className="chip" onClick={() => setRefIn('6.14')}>Dollar 6.14</button>
          </div>
          <p className="measure-step" data-testid="measure-step"><strong>{STEPS[step]}</strong></p>
          <div className="measure-tools">
            <button className="icon-btn" onClick={() => setZoom(Math.max(1, zoom / 1.5))} aria-label="Zoom out">−</button>
            <button className="icon-btn" onClick={() => setZoom(Math.min(6, zoom * 1.5))} aria-label="Zoom in">+</button>
            <button className="btn" onClick={() => setPts(pts.slice(0, -1))} disabled={!pts.length}>Undo tap</button>
            <button className="btn" onClick={() => setPts([])} disabled={!pts.length}>Start over</button>
          </div>
          <div className="measure-scroll">
            <div className="measure-photo" style={{ width: `${zoom * 100}%` }} onPointerDown={onDown} onPointerUp={onUp} data-testid="measure-area">
              <img ref={imgRef} src={src} alt="" draggable="false"
                onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
              <svg viewBox={`0 0 ${natural.w} ${natural.h}`} preserveAspectRatio="none">
                {[0, 2, 4].map((i) => pts[i + 1] && (
                  <line key={i} x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y}
                    stroke={colors[i]} strokeWidth={dot / 1.5} />
                ))}
                {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dot} fill={colors[i]} stroke="#000" strokeWidth={dot / 4} />)}
              </svg>
            </div>
          </div>
          <p className="measure-result" data-testid="measure-result">
            Width: <strong>{w ? `≈${fmtIn(w, 2)} in` : '—'}</strong> · Height: <strong>{h ? `≈${fmtIn(h, 2)} in` : '—'}</strong>
          </p>
          <button className="btn primary wide" disabled={!w} onClick={() => onUse({ w, h })} data-testid="use-measure">
            Use {h ? 'width and height' : 'width'}
          </button>
          <p className="muted small">
            Expect about ±10%: the camera stretches the edges of a photo. A tape measure is always better.
          </p>
        </>
      )}
    </Sheet>
  )
}
