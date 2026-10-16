// Barcode reading, done on the phone by zxing-wasm (free, open source). Its decoder file
// (zxing_reader.wasm) is bundled with this app, so nothing is fetched from anyone else's server.

import { candidateKeys, checkDigit } from './upc.js'

const FORMATS = ['UPCA', 'UPCE', 'EAN13', 'EAN8']
let readerPromise = null

/** Load the reader once (about 1 MB, cached for offline use after the first time). */
export function loadReader() {
  readerPromise ||= (async () => {
    const [{ prepareZXingModule, readBarcodes }, { default: wasmUrl }] = await Promise.all([
      import('zxing-wasm/reader'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL(wasmUrl, location.href).href : prefix + path) },
      fireImmediately: true,
    })
    return readBarcodes
  })()
  readerPromise.catch(() => { readerPromise = null })
  return readerPromise
}

/** Read one retail barcode from ImageData or an image file. Returns { text, format } or null. */
export async function readOne(input) {
  const readBarcodes = await loadReader()
  const found = await readBarcodes(input, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 })
  const hit = found.find((b) => b.isValid && b.text)
  return hit ? { text: hit.text, format: hit.format } : null
}

/**
 * UPC-E (the short 8-digit barcode on small packages) -> the full 12-digit UPC-A.
 * Standard rule: the 7th digit says how the manufacturer and product digits were squeezed.
 */
export function expandUpcE(code) {
  const d = String(code).replace(/\D/g, '')
  if (d.length !== 8 || !/^[01]/.test(d)) return null
  const [ns, d1, d2, d3, d4, d5, d6, check] = d
  let body
  if (d6 <= '2') body = `${d1}${d2}${d6}00` + `00${d3}${d4}${d5}`
  else if (d6 === '3') body = `${d1}${d2}${d3}00` + `000${d4}${d5}`
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}0` + `0000${d5}`
  else body = `${d1}${d2}${d3}${d4}${d5}` + `0000${d6}`
  const first11 = ns + body
  return String(checkDigit(first11)) === check ? first11 + check : null
}

/** The 12-digit keys a scanned barcode could be, best first. */
export function keysFromScan(text, format = '') {
  const d = String(text).replace(/\D/g, '')
  if (/UPC-?E/i.test(format) || (d.length === 8 && !/EAN/i.test(format))) {
    const full = expandUpcE(d)
    return full ? [full] : []
  }
  if (d.length === 13 && !d.startsWith('0')) return [] // a non-US EAN-13 cannot be a 12-digit UPC
  if (/EAN-?8/i.test(format)) return []
  return candidateKeys(d)
}

/** Pick the key that is in the store data (or the first reading if none is). */
export function matchScan(text, format, has) {
  const keys = keysFromScan(text, format)
  return { keys, upc: keys.find(has) || null, best: keys[0] || null }
}
