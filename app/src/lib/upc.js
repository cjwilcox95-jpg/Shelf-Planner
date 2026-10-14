// UPC helpers. Same rules as scripts/upc.py (the data-prep side).
// A UPC-A barcode is 12 digits; the last one (check digit) is calculated from the first 11.

export const digits = (raw) => String(raw ?? '').replace(/\D/g, '')

export function checkDigit(first11) {
  if (!/^\d{11}$/.test(first11)) throw new Error(`need 11 digits, got ${first11}`)
  let odd = 0
  let even = 0
  for (let i = 0; i < 11; i++) {
    if (i % 2 === 0) odd += Number(first11[i])
    else even += Number(first11[i])
  }
  return (10 - ((odd * 3 + even) % 10)) % 10
}

export const isValidUpc12 = (code) =>
  /^\d{12}$/.test(code) && checkDigit(code.slice(0, 11)) === Number(code[11])

/** 12-digit keys a typed or scanned number could mean (with or without check digit). */
export function candidateKeys(raw) {
  let d = digits(raw)
  const out = []
  if (d.length === 13 && d.startsWith('0')) d = d.slice(1)
  if (d.length >= 7 && d.length <= 12) {
    const full = d.padStart(12, '0')
    if (isValidUpc12(full)) out.push(full)
  }
  if (d.length >= 6 && d.length <= 11) {
    const first11 = d.padStart(11, '0')
    const k = first11 + checkDigit(first11)
    if (!out.includes(k)) out.push(k)
  }
  return out
}

/** 0-36800-47637-1 style, easy to compare with a shelf tag. */
export const prettyUpc = (k) =>
  k && k.length === 12 ? `${k[0]}-${k.slice(1, 6)}-${k.slice(6, 11)}-${k[11]}` : k || ''
