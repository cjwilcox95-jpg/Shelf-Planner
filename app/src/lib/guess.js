// Default dimension GUESSES. None of the store files has real product sizes, so every
// product starts with a guess based on its package type and its size (oz, lb, ...).
// Guesses are always labeled "guess" and drawn dashed with a "~". Stage 3 makes this
// table editable and lets you replace any guess with a real measurement.

/**
 * Package types, checked in order. `ref` is a typical product of that type:
 * at `oz` ounces it is w x h x d inches. Other sizes are scaled by the cube root
 * of the size ratio (twice the volume -> about 1.26x each way).
 */
export const PACKAGE_TYPES = [
  { id: 'pouch', label: 'Pouch / bag of pods', words: /\b(POUCH|PCH|POU|FLINGS)\b/, ref: { oz: 5, w: 4.5, h: 7, d: 1.25 } },
  { id: 'can', label: 'Food can', words: /\b(CAN|CANS|CND|CANNED)\b/, ref: { oz: 15, w: 3, h: 4.5, d: 3 } },
  { id: 'aerosol', label: 'Aerosol / spray can', words: /\b(STARCH|AEROSOL|AERSL|AER)\b/, ref: { oz: 20, w: 2.75, h: 9.5, d: 2.75 } },
  { id: 'trigger', label: 'Trigger spray bottle', words: /\b(TRIGGER|TRIG|SPRAY|SPRY|SPR)\b/, ref: { oz: 22, w: 4, h: 10.5, d: 2.5 } },
  { id: 'tub', label: 'Tub (pods, powders)', words: /\b(PODS|PACS|PACKS|TUB|OXI CLEAN|OXICLEAN|POWDER|PWD)\b/, ref: { oz: 48, w: 7, h: 6.5, d: 7 } },
  {
    id: 'jug', label: 'Jug with handle (bleach, detergent)',
    words: /\b(BLEACH|BLCH|DETERGENT|DETERG|DET|LAUNDRY|LNDRY|SOFTENER|SFTNR|FAB SOFT|FABRIC|CLORALEN|CLOROX)\b/,
    ref: { oz: 92, w: 6.75, h: 11.5, d: 4.75 },
  },
  {
    id: 'squeeze', label: 'Squeeze bottle',
    words: /\b(SQZ|SQUEEZE|SQUEEZ|PLASTIC|PLSTC|INVERT|UPSIDE|EZ SQ|EZ SQZ|KETCHUP|MUSTARD|MSTRD|MUSTD|MAYO|MAYONNAISE|DISH|DISHWASHING)\b/,
    ref: { oz: 20, w: 2.75, h: 8.5, d: 2.1 },
  },
  {
    id: 'jar', label: 'Glass jar',
    words: /\b(GLASS|GLS|JAR|PICKLES?|DILLS?|SPEARS?|RELISH|OLIVES?|PEPPERS?|JALAPENOS?|PEPERONCINI|SALSA|GHERKINS?|OKRA|CAPERS|ARTICHOKE|PEANUT BUTTER|JELLY|JAM|PRESERVES)\b/,
    ref: { oz: 24, w: 3.4, h: 6.6, d: 3.4 },
  },
  { id: 'sheets', label: 'Box of dryer sheets', words: /\b(SHEETS?|SHTS?)\b/, ref: { oz: 0, w: 5.75, h: 5.5, d: 2.75 } },
  {
    id: 'bottle', label: 'Bottle',
    words: /\b(BTL|BOTTLE|DRESSING|SAUCE|SCE|SYRUP|OIL|VINEGAR|JUICE|WATER|SODA|DRINK)\b/,
    ref: { oz: 16, w: 2.8, h: 8.3, d: 2.8 },
  },
  { id: 'box', label: 'Box', words: /\b(BOX|CEREAL|CRL|CRACKERS?|MIX|PASTA|MAC)\b/, ref: { oz: 12, w: 7.5, h: 10, d: 2.5 } },
  { id: 'bag', label: 'Bag', words: /\b(BAG|CHIPS?|SNACKS?|CANDY|POPCORN)\b/, ref: { oz: 10, w: 9, h: 12, d: 3 } },
  { id: 'other', label: 'Other', words: null, ref: { oz: 16, w: 3.5, h: 6, d: 3.5 } },
]

// Size -> ounces (fluid ounces and weight ounces are treated alike; this is a rough guess).
const TO_OZ = {
  OZ: 1, FZ: 1, 'FL OZ': 1, LB: 16, GL: 128, GAL: 128, QT: 32, PT: 16,
  LT: 33.8, L: 33.8, ML: 1 / 29.57, GR: 1 / 28.35, GM: 1 / 28.35, G: 1 / 28.35, KG: 35.27,
}

export function sizeInOz(sizeValue, uom) {
  const f = TO_OZ[(uom || '').toUpperCase()]
  return f && sizeValue > 0 ? sizeValue * f : null
}

/** Parse "20 OZ" / "64.00 OZ" when sizeValue/uom were not stored separately. */
export function parseSize(size) {
  const m = /^\s*(\d*\.?\d+)\s*([A-Za-z][A-Za-z ]*)?\s*$/.exec(size || '')
  return m ? { value: Number(m[1]), uom: (m[2] || '').trim().toUpperCase() } : { value: null, uom: null }
}

/** The package type a product looks like, from its name. `types` lets you pass an edited table. */
export function packageTypeFor(text, types = PACKAGE_TYPES) {
  const t = (text || '').toUpperCase()
  return types.find((p) => p.words && p.words.test(t)) || types.find((p) => p.id === 'other') || types[types.length - 1]
}

/** The table with any numbers CJ has edited (saved as { typeId: { oz, w, h, d } }). */
export function withEdits(edits = {}) {
  return PACKAGE_TYPES.map((p) => (edits[p.id] ? { ...p, ref: { ...p.ref, ...edits[p.id] }, original: p.ref, edited: true } : p))
}

const round = (x) => Math.round(x * 4) / 4 // nearest quarter inch

/**
 * Guess w/h/d for a product. `text` is the description plus its category names.
 * Returns { w, h, d, type, basis }.
 */
export function guessDims({ text, sizeValue, uom, size }, { types = PACKAGE_TYPES, typeId } = {}) {
  const type = (typeId && types.find((p) => p.id === typeId)) || packageTypeFor(text, types)
  let value = sizeValue
  let unit = uom
  if (value == null && size) ({ value, uom: unit } = parseSize(size))
  const oz = sizeInOz(value, unit)
  let k = 1
  let basis = `typical ${type.label.toLowerCase()}`
  if (oz && type.ref.oz > 0) {
    k = Math.cbrt(oz / type.ref.oz)
    k = Math.min(2.5, Math.max(0.5, k))
    basis = `${type.label.toLowerCase()}, scaled from ${type.ref.oz} oz`
  }
  return {
    w: Math.max(0.5, round(type.ref.w * k)),
    h: Math.max(0.5, round(type.ref.h * k)),
    d: Math.max(0.5, round(type.ref.d * k)),
    type: type.id,
    basis,
  }
}
