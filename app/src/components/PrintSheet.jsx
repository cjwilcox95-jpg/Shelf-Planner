import { useEffect, useState } from 'react'
import { Sheet } from './Panels.jsx'
import { pagesToPdf, pageToPng, printFileName, renderPages } from '../lib/printPlan.js'
import { shareOrDownload } from '../lib/backup.js'
import { loadFullPhotoUrls } from '../lib/usePhotos.js'

/**
 * Print or save the open plan: a drawing to scale and a product list with check boxes.
 * Step 1 makes the pages; step 2 saves or shares them (a separate tap, which phones require for sharing).
 */
export function PrintSheet({ plan, check, products, photoIndex = {}, extraTables = [], compareOptions = [], compareId, onCompareId, sections = null, onClose }) {
  const anyPhotos = plan.shelves.some((s) => s.items.some((i) => photoIndex[i.upc]))
  const [opts, setOpts] = useState({ drawing: true, list: true, usePhotos: true })
  const [made, setMade] = useState(null) // { pdf, png, preview, pages }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => { setOpts({ ...opts, [k]: v }); setMade(null) }

  useEffect(() => () => { if (made?.preview) URL.revokeObjectURL(made.preview) }, [made])
  useEffect(() => { setMade(null) }, [compareId])

  const make = async () => {
    setBusy(true)
    setMsg(null)
    let photos = null
    try {
      // an aisle prints each section in turn, left to right
      const parts = sections || [{ plan, check }]
      // the photos themselves (sharper than the small copies on screen), read only for the products printed
      if (opts.usePhotos && anyPhotos) {
        photos = await loadFullPhotoUrls(parts.flatMap((part) => part.plan.shelves.flatMap((s) => s.items.map((i) => i.upc)))
          .filter((u) => photoIndex[u]))
      }
      const pages = []
      for (const [i, part] of parts.entries()) {
        pages.push(...await renderPages(part.plan, part.check, products, photos?.urls || {}, { ...opts, extraTables: i === 0 ? extraTables : [] }))
      }
      const pdf = pagesToPdf(pages, plan.name)
      const png = await pageToPng(pages[0].canvas)
      setMade({ pdf, png, preview: URL.createObjectURL(png), pages: pages.length })
    } catch (e) {
      setMsg(`Could not make it: ${e.message}`)
    }
    photos?.release()
    setBusy(false)
  }

  const send = async (blob, ext, type) => {
    const how = await shareOrDownload(blob, printFileName(plan, ext), { type, title: plan.name })
    setMsg(how === 'cancelled' ? null : how === 'shared' ? 'Done. To print, choose Print in the share menu.' : 'Saved to your downloads.')
  }

  const nothing = !opts.drawing && !opts.list && !extraTables.length
  return (
    <Sheet title="Print or save as PDF" onClose={onClose} tall>
      <p className="muted small">Makes a PDF of this plan: a drawing to scale and a list to tick off while you set the shelf. No prices, ever.{sections ? ` This aisle prints its ${sections.length} sections one after another.` : ''}</p>
      <label className="check"><input type="checkbox" checked={opts.drawing} onChange={(e) => set('drawing', e.target.checked)} /><span>Drawing of the section</span></label>
      <label className="check"><input type="checkbox" checked={opts.list} onChange={(e) => set('list', e.target.checked)} /><span>Product list with check boxes</span></label>
      {anyPhotos && (
        <label className="check"><input type="checkbox" checked={opts.usePhotos} onChange={(e) => set('usePhotos', e.target.checked)} /><span>Show product photos in the drawing</span></label>
      )}
      {compareOptions.length > 0 && (
        <label className="field">
          <span>Add a list of changes from another plan</span>
          <select className="select" value={compareId || ''} onChange={(e) => onCompareId(e.target.value || null)} data-testid="print-compare">
            <option value="">No change list</option>
            {compareOptions.map((p) => <option key={p.id} value={p.id}>Changes from “{p.name}”</option>)}
          </select>
        </label>
      )}
      <button className="btn primary wide" onClick={make} disabled={busy || nothing} data-testid="make-pdf">
        {busy ? 'Making the pages…' : made ? 'Make it again' : 'Make the PDF'}
      </button>
      {made && (
        <div className="print-ready" data-testid="print-ready">
          <p><strong>Ready: {made.pages} page{made.pages > 1 ? 's' : ''}.</strong></p>
          <button className="btn primary wide" onClick={() => send(made.pdf, 'pdf', 'application/pdf')} data-testid="save-pdf">Save or share the PDF</button>
          <button className="btn wide" onClick={() => send(made.png, 'png', 'image/png')} data-testid="save-png">Save page 1 as a picture</button>
          <img src={made.preview} alt="Preview of the first page" className="print-preview" />
        </div>
      )}
      {msg && <p className={msg.startsWith('Could not') ? 'error' : 'ok-msg'} role="status">{msg}</p>}
    </Sheet>
  )
}
