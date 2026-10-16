// Reading tape-measure numbers: "2 3/4", "2-3/4", "2¾", "3/4", "2.75" -> inches.

const UNICODE = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅓': '1/3', '⅔': '2/3' }

/** Inches as a number, or NaN when it cannot be read. Blank -> NaN. */
export function parseInches(raw) {
  let s = String(raw ?? '').trim().toLowerCase()
  for (const [u, f] of Object.entries(UNICODE)) s = s.replace(u, ` ${f}`)
  s = s.replace(/(in(ches?)?|"|″)$/, '').trim()
  if (!s) return NaN
  if (/^\d*\.?\d+$/.test(s)) return Number(s)
  const m = s.match(/^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/)
  if (m) {
    const [, whole, num, den] = m
    if (Number(den) === 0) return NaN
    return (whole ? Number(whole) : 0) + Number(num) / Number(den)
  }
  return NaN
}

/** Put a fraction on a typed number: ("2", "3/4") -> "2 3/4"; ("2 1/2", "3/4") -> "2 3/4"; ("", "1/2") -> "1/2". */
export function withFraction(value, frac) {
  const whole = String(value ?? '').trim().replace(/[\s-]*\d+\s*\/\s*\d+$/, '').replace(/\.\d*$/, '').trim()
  return whole ? `${whole} ${frac}` : frac
}

export const FRACTIONS = ['1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8']
