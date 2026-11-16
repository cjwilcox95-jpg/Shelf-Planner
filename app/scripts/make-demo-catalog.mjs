// Makes public/demo-catalog.json: a small MADE-UP store-data file, so anyone can try the app without a file of
// their own, and so the browser tests run on any computer. Nothing in it comes from a real store:
//  - the brands are invented;
//  - every UPC starts with 4, the range kept for a shop's own in-house codes, so none is a real product's barcode.
//   node scripts/make-demo-catalog.mjs
import fs from 'node:fs'
import path from 'node:path'
import { checkDigit } from '../src/lib/upc.js'

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/demo-catalog.json')
const brands = ['SUNNYVALE', 'RED BARN', 'OAKFIELD', 'BLUE HERON', 'GOLDEN ACRE', 'MAPLE RUN', 'PRAIRIE', 'COPPER POT']
const kinds = [
  ['KETCHUP SQZ', ['14 OZ', '20 OZ', '32 OZ', '38 OZ', '64 OZ'], '10'], ['MUSTARD YELLOW', ['8 OZ', '14 OZ', '20 OZ'], '10'],
  ['MUSTARD SPICY BRN', ['12 OZ'], '10'], ['MAYO REAL', ['15 OZ', '30 OZ'], '10'], ['BBQ SAUCE ORIG', ['18 OZ', '28 OZ'], '10'],
  ['BBQ SAUCE HNY', ['18 OZ'], '10'], ['RELISH SWEET', ['10 OZ', '16 OZ'], '10'], ['HOT SAUCE', ['5 OZ', '12 OZ'], '10'],
  ['STEAK SAUCE', ['10 OZ'], '10'], ['PICKLES DILL SPEARS', ['24 OZ'], '10'], ['SALSA MILD', ['16 OZ'], '10'],
  ['FRZ PIZZA PEPPERONI', ['22 OZ'], '20'], ['FRZ DINNER CHICKEN', ['10 OZ'], '20'],
]
let n = 0
const items = []
for (const b of brands) for (const [k, sizes, sub] of kinds) for (const s of sizes) {
  const first11 = `4${String(10000 + n * 37).padStart(5, '0')}${String(10000 + n * 13).padStart(5, '0')}`
  n++
  const [v, u] = s.split(' ')
  items.push({ upc: first11 + checkDigit(first11), description: `${b} ${k}`, pack: 12, size: s, sizeValue: Number(v), uom: u, classCode: '301', subclassCode: sub, source: 'demo' })
}
const ri = (i, f, extra = {}) => ({ location: 1, upc: i.upc, description: i.description, casePack: 12, size: i.size, facings: f, capacity: 12 * f, status: 'keep', ...extra })
const pick = (re, sizeRe = /./) => items.filter((i) => re.test(i.description) && sizeRe.test(i.size))
const resets = [
  {
    id: 'demo-ketchup', name: 'KETCHUP MUSTARD', date: '2026-03', widthFt: 4, heightFt: 6,
    shelves: [
      { shelf: 1, depthIn: 22, clearanceIn: 13, items: pick(/KETCHUP/, /64|38/).slice(0, 7).map((i, k) => ri(i, k % 3 === 0 ? 2 : 1)) },
      { shelf: 2, depthIn: 22, clearanceIn: 11, items: pick(/KETCHUP/, /32|20/).slice(0, 9).map((i, k) => ri(i, k < 2 ? 3 : 1)) },
      { shelf: 3, depthIn: 22, clearanceIn: 10, items: pick(/MUSTARD/).slice(0, 11).map((i, k) => ri(i, k === 0 ? 4 : 1)) },
      { shelf: 4, depthIn: 22, clearanceIn: 10, items: pick(/BBQ|STEAK/).slice(0, 9).map((i, k) => ri(i, k % 4 === 0 ? 2 : 1)) },
      { shelf: 5, depthIn: 22, items: pick(/RELISH|HOT SAUCE/).slice(0, 12).map((i, k) => ri(i, 1, k === 0 ? { high: 2 } : {})) },
    ],
    unallocated: pick(/SALSA/).slice(0, 3).map((i) => ri(i, 1)),
  },
  {
    id: 'demo-pickles', name: 'PICKLES RELISH', date: '2026-02', widthFt: 4, heightFt: 6,
    shelves: [
      { shelf: 1, depthIn: 22, items: pick(/PICKLES/).slice(0, 6).map((i) => ri(i, 2)) },
      { shelf: 2, depthIn: 22, items: pick(/RELISH/).slice(0, 8).map((i) => ri(i, 1)) },
    ],
    unallocated: [],
  },
  {
    id: 'demo-freezer', name: 'FROZEN PIZZA DINNERS', date: '2026-01', widthFt: 5, heightFt: 6, doors: 2, fixture: 'Freezer, 2 doors',
    shelves: [
      { shelf: 1, door: 1, depthIn: 24, clearanceIn: 12, items: pick(/FRZ PIZZA/).slice(0, 2).map((i) => ri(i, 1)) },
      { shelf: 2, door: 1, depthIn: 24, clearanceIn: 12, items: pick(/FRZ DINNER/).slice(0, 4).map((i) => ri(i, 1)) },
      { shelf: 1, door: 2, depthIn: 24, clearanceIn: 12, items: pick(/FRZ PIZZA/).slice(2, 4).map((i) => ri(i, 1)) },
      { shelf: 2, door: 2, depthIn: 24, clearanceIn: 12, items: pick(/FRZ DINNER/).slice(4, 8).map((i) => ri(i, 1)) },
    ],
    unallocated: [],
  },
]
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({
  kind: 'shelf-planner-catalog', version: 'demo', built: '2026-01-01', sources: ['made-up demo data'],
  classNames: { 301: 'Demo grocery' }, subclassNames: { '301-10': 'Condiments', '301-20': 'Frozen' }, items, resets, afiSizes: {},
}) + '\n')
console.log(`${items.length} made-up products, ${resets.length} sets -> ${OUT}`)
