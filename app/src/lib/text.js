// How product names and sizes are written on screen.

/** Names in normal case, easier to read than the store files' capitals; short codes like FDC or HNZ stay as they are. */
export const niceName = (s) => String(s || '')
  .replace(/[A-Za-z0-9']+/g, (w) => (w.length <= 3 && !/[AEIOU]/i.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))

/** "20 OZ" -> "20 oz" */
export const niceSize = (s) => String(s || '').replace(/\b(OZ|LB|CT|PK|GL|QT|LT|EA)\b/g, (u) => u.toLowerCase())
