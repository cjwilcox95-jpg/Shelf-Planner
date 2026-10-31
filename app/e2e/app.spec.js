// End-to-end checks in a real browser. They use the store-data file built by
// scripts/build_catalog.py (data/build/catalog.json), which never leaves this machine.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const CATALOG = path.resolve('../data/build/catalog.json')
const SHOTS = path.resolve('../data/build/screenshots')
fs.mkdirSync(SHOTS, { recursive: true })
test.skip(!fs.existsSync(CATALOG), 'store data not built')

const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-${name}.png`), fullPage })

const rows = (page) => page.getByTestId('shelf-row') // top shelf first
/** Product names on one shelf (e.g. "Shelf 7 (top)"), left to right, read from the drawing. */
async function shelfNames(page, label) {
  const n = Number(label.match(/Shelf (\d+)/)[1])
  const total = await rows(page).count()
  return rows(page).nth(total - n).getByTestId('tile').evaluateAll((els) => els.map((e) => e.dataset.name))
}
/** What is off the shelf (opens and closes that list). */
async function trayNames(page) {
  await page.getByTestId('status-pill').click()
  if (!(await page.getByTestId('status-tray').count())) { await page.getByRole('button', { name: 'Done' }).click(); return [] }
  await page.getByTestId('status-tray').click()
  const names = await page.getByTestId('tray').locator('.row-name').allInnerTexts()
  await page.getByRole('button', { name: 'Done' }).click()
  return names
}
/** Back to the whole set (if zoomed in to a shelf). */
async function wholeSet(page) {
  if (await page.getByTestId('minimap').count()) await page.getByTestId('minimap').click()
  await expect(page.getByTestId('minimap')).toHaveCount(0)
}
/** Zoom in to shelf n by tapping its board in the whole set. */
async function openShelf(page, n) {
  await wholeSet(page)
  const total = await rows(page).count()
  await rows(page).nth(total - n).getByTestId('board-label').first().click()
  await expect(page.getByTestId('focus-name')).toContainText(`Shelf ${n}`)
  await settled(page)
}
/** Wait until the drawing window has finished gliding to the shelf. */
async function settled(page) {
  let last = null
  await expect.poll(async () => {
    const now = await page.getByTestId('d-window').evaluate((el) => `${el.scrollTop}|${el.clientHeight}`)
    const same = now === last
    last = now
    return same
  }, { intervals: [150, 150, 150, 200, 300] }).toBe(true)
}
/** Tap product k of row r (top row = 0) in the whole set: zooms in with its row open. */
async function openProduct(page, r, k) {
  await wholeSet(page)
  await rows(page).nth(r).getByTestId('tile').nth(k).click()
  await expect(page.locator('.frow.open')).toBeVisible()
}
const openRow = (page) => page.locator('.frow.open')
/** The section status details (opens the panel; close it with Done). */
async function openStatus(page) {
  await page.getByTestId('status-pill').click()
  return page.getByTestId('summary')
}

async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('status-pill')).toBeVisible()
}

/** A real finger: press, hold, slide, lift (Chrome DevTools touch events). */
async function fingerDrag(page, from, to, { hold = 650, steps = 16 } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const pt = (x, y) => ({ touchPoints: [{ x: Math.round(x), y: Math.round(y) }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', ...pt(from.x, from.y) })
  await page.waitForTimeout(hold)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', ...pt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps),
    })
    await page.waitForTimeout(20)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function drag(page, info, from, to) {
  if (info.project.name === 'phone') return fingerDrag(page, from, to)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
}

const center = async (loc) => {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('first run: load store data, the whole AFI Ketchup-Mustard section appears', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('Load your store data')).toBeVisible()
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('plan-name')).toContainText('Ketchup - Mustard')
  await expect(rows(page)).toHaveCount(7)
  expect(await shelfNames(page, 'Shelf 7 (top)')).toHaveLength(10)
  expect(await shelfNames(page, 'Shelf 1 (bottom)')).toHaveLength(4)
  expect(await trayNames(page)).toHaveLength(2) // the 2 items AFI left off the set
  await shot(page, '01-section')
  await shot(page, '01b-section-full', true)
  // nothing wider than the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
})

test('drag a product to another shelf', async ({ page }, info) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  const six = await shelfNames(page, 'Shelf 6')
  const from = await center(rows(page).nth(0).getByTestId('tile').nth(0)) // first product, top shelf
  const targetTile = await rows(page).nth(1).getByTestId('tile').nth(2).boundingBox() // shelf 6, third product
  await drag(page, info, from, { x: targetTile.x + targetTile.width * 0.1, y: targetTile.y + targetTile.height / 2 })
  expect(await shelfNames(page, 'Shelf 7 (top)')).toEqual(top.slice(1))
  const sixAfter = await shelfNames(page, 'Shelf 6')
  expect(sixAfter).toHaveLength(six.length + 1)
  expect(sixAfter[2]).toBe(top[0])
  await expect(page.locator('.toast')).toContainText('Moved')
  await shot(page, '02-after-drag-between-shelves')
})

test('drag within a shelf', async ({ page }, info) => {
  await loadData(page)
  const before = await shelfNames(page, 'Shelf 7 (top)')
  const tiles = rows(page).nth(0).getByTestId('tile')
  const from = await center(tiles.nth(0))
  const fourth = await tiles.nth(3).boundingBox()
  await drag(page, info, from, { x: fourth.x + fourth.width * 0.8, y: from.y })
  const after = await shelfNames(page, 'Shelf 7 (top)')
  expect(after[3]).toBe(before[0])
  expect(after.slice(0, 3)).toEqual(before.slice(1, 4))
})

test('whole set and one shelf: tap zooms in, the shelf buttons and a swipe step, the mini picture zooms out', async ({ page }, info) => {
  await loadData(page)
  await expect(page.getByTestId('switcher')).toContainText('Whole set')
  await openShelf(page, 7)
  await expect(page.getByTestId('shelf-rows').getByTestId('frow')).toHaveCount(10)
  await expect(rows(page).nth(1)).toHaveClass(/dim/) // the other shelves fade back
  await page.getByTestId('shelf-down').click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 6')
  await expect(page.getByTestId('shelf-up')).toContainText('Shelf 7')
  if (info.project.name === 'phone') {
    const box = await page.getByTestId('d-window').boundingBox()
    await fingerDrag(page, { x: box.x + 200, y: box.y + box.height - 10 }, { x: box.x + 200, y: box.y + 10 }, { hold: 30, steps: 6 }) // swipe up
    await expect(page.getByTestId('focus-name')).toHaveText('Shelf 5')
  }
  await shot(page, '03-one-shelf')
  await page.getByTestId('minimap').click()
  await expect(page.getByTestId('switcher')).toContainText('Whole set')
  await expect(page.locator('.shelf-row.dim')).toHaveCount(0)
})

test('arrows move a product along a shelf and to the shelf below; Details > Move still works', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  const six = await shelfNames(page, 'Shelf 6')
  await openProduct(page, 0, 0)
  await expect(openRow(page)).toContainText(top[0])
  await openRow(page).getByRole('button', { name: 'Move right' }).click()
  expect((await shelfNames(page, 'Shelf 7 (top)')).slice(0, 2)).toEqual([top[1], top[0]])
  await shot(page, '04-arrows')
  await openRow(page).getByRole('button', { name: 'Move down a shelf' }).click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 6') // the screen follows the product
  await expect(page.locator('.toast')).toContainText('Moved to Shelf 6')
  const sixAfter = await shelfNames(page, 'Shelf 6')
  expect(sixAfter).toHaveLength(six.length + 1)
  expect(sixAfter[1]).toBe(top[0]) // same spot it had above
  // Details > Move, then tap the shelf's heading: it goes to the end of that shelf
  await openRow(page).getByTestId('details').click()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByText('Tap a shelf where it should go.')).toBeVisible()
  await rows(page).nth(1).getByTestId('shelf-head').click()
  expect((await shelfNames(page, 'Shelf 6')).at(-1)).toBe(top[0])
})

test('take off, the tray, put back, and delete', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  await openProduct(page, 0, 1)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  expect((await trayNames(page))[0]).toBe(top[1])
  expect(await shelfNames(page, 'Shelf 7 (top)')).toHaveLength(top.length - 1)
  // put it on shelf 5: open that shelf, then the off-the-shelf list
  await openShelf(page, 5)
  await page.getByTestId('open-tray').click()
  await shot(page, '05-tray')
  await page.getByTestId('tray').getByTestId('tray-row').filter({ hasText: top[1] }).getByRole('button', { name: /^Put on Shelf 5/ }).click()
  expect((await shelfNames(page, 'Shelf 5')).at(-1)).toBe(top[1])
  // delete for good from the off-the-shelf list
  await page.getByTestId('open-tray').click()
  await page.getByTestId('tray').getByRole('button', { name: /^Delete / }).first().click()
  await page.getByRole('button', { name: 'Done' }).click()
  expect(await trayNames(page)).toHaveLength(1)
})

test('facings, OVER on one shelf, undo/redo, and it survives a reload', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 0, 0)
  const facings = openRow(page).getByTestId('row-facings')
  const start = Number(await facings.innerText())
  for (let i = 0; i < 8; i++) await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  await expect(facings).toHaveText(String(start + 8))
  await expect(page.getByTestId('focus-left')).toContainText('in over')
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
  await expect(page.locator('.mm-board.over')).toHaveCount(1) // the mini picture shows it too
  await shot(page, '06-over')
  await page.getByTestId('undo').click()
  await expect(facings).toHaveText(String(start + 7))
  await page.getByTestId('open-tools').click()
  await page.getByTestId('redo').click()
  await expect(facings).toHaveText(String(start + 8))
  await page.reload()
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
})

test('search by name and by UPC, add to the shelf you tapped', async ({ page }) => {
  await loadData(page)
  await openShelf(page, 1) // bottom shelf
  await page.getByTestId('open-add').click()
  await expect(page.getByRole('dialog')).toContainText('Add to Shelf 1 (bottom)')
  const input = page.getByTestId('search-input')
  await input.fill('frenchs mustard')
  await expect(page.getByTestId('add-result').first()).toBeVisible()
  await shot(page, '07-search')
  await input.fill('0-41500-00031')
  await expect(page.locator('.results .row-name').first()).toContainText('FRENCHS')
  await page.getByTestId('add-result').first().click()
  expect((await shelfNames(page, 'Shelf 1 (bottom)')).at(-1)).toContain('FRENCHS')
})

test('plans: copy, rename, switch, start from AFI, delete', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByTestId('plan-name')).toContainText('(copy)')
  // change the copy so the two differ
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Rename' }).first().click()
  await page.getByLabel('Plan name').fill('Ketchup proposed')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('plan-name')).toHaveText('Ketchup proposed')
  await shot(page, '08-plans')
  // open the original: it still has all 10 on the top shelf
  await page.getByRole('button', { name: 'Open', exact: true }).first().click()
  expect(await shelfNames(page, 'Shelf 7 (top)')).toHaveLength(10)
  // new plan from the 8 ft Pickles reset
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-afi').click()
  await page.getByTestId('afi-01-08-24_PICKLES-RELISH').click()
  await expect(page.getByTestId('plan-name')).toContainText('Pickles')
  await expect(rows(page)).toHaveCount(7)
  await shot(page, '09-pickles-8ft')
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(3)
  await page.getByRole('button', { name: /Delete Pickles/ }).click()
  await expect(page.getByRole('dialog', { name: 'Delete this plan?' })).toContainText('cannot be undone')
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(2)
})

test('shelf size for one shelf or all, add and remove a shelf', async ({ page }) => {
  await loadData(page)
  await openShelf(page, 7)
  await page.getByTestId('open-shelf').click()
  await page.getByTestId('field-clearanceIn').fill('6')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('section-status')).toHaveText('Width fits') // the 6.6 in mustard bottles no longer clear 6 in
  await expect(await openStatus(page)).toContainText('taller than the clearance')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('open-shelf').click()
  await page.getByRole('button', { name: '36', exact: true }).click()
  await page.getByLabel('Use these sizes for every shelf').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows(page).nth(6).getByTestId('shelf-head')).toContainText('of 36 ·')
  await page.getByTestId('open-shelf').click()
  await page.getByRole('button', { name: 'Add a shelf on top' }).click()
  await expect(rows(page)).toHaveCount(8)
  await page.getByTestId('open-shelf').click()
  await page.getByRole('button', { name: 'Remove this shelf' }).click()
  await expect(rows(page)).toHaveCount(7)
})

test('export a backup, then load it on a fresh phone', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'file download checked on desktop')
  await loadData(page)
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await page.getByTestId('photo-input').setInputFiles(path.resolve('../data/build/photos/synthetic-bottle.png'))
  await expect(page.locator('.toast')).toContainText('Photo saved')
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-backup').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()])
  expect(download.suggestedFilename()).toMatch(/^shelf-planner-backup-\d{4}-\d\d-\d\d\.json$/)
  const file = path.join(SHOTS, '..', 'test-backup.json')
  await download.saveAs(file)
  const text = fs.readFileSync(file, 'utf8')
  const backup = JSON.parse(text)
  expect(backup.kind).toBe('shelf-planner-backup')
  expect(backup.plans).toHaveLength(2)
  expect(backup.catalog.items.length).toBeGreaterThan(20000)
  expect(Object.keys(backup.photos)).toHaveLength(1)
  expect(text).not.toMatch(/\d\.\d{4}/) // no cost-like numbers
  await expect(page.getByText(/Last backup:/)).not.toContainText('never')

  // a brand-new browser (like a new phone)
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p2 = await fresh.newPage()
  await p2.goto('./')
  await p2.getByTestId('data-file').setInputFiles(file)
  await expect(p2.getByTestId('status-pill')).toBeVisible()
  await p2.getByRole('button', { name: 'Plans', exact: true }).click()
  await expect(p2.getByTestId('plan-list').locator('li')).toHaveCount(2)
  await p2.getByRole('button', { name: 'Done' }).click()
  await expect(p2.locator('.tile.has-photo')).toHaveCount(1) // the photo came along
  await fresh.close()
})

test('a shelf saved by the old one-shelf version becomes a plan', async ({ page }) => {
  await loadData(page)
  // Pretend this phone only has a Stage 2 save
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('shelf-planner', 1)
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite')
      const kv = tx.objectStore('kv')
      kv.delete('plans')
      kv.delete('currentPlanId')
      kv.put({ name: 'My old shelf', widthIn: 48, depthIn: 24, clearanceIn: 12, note: '',
        items: [{ uid: 'old1', upc: '013000001243', facings: 3, description: 'HNZ KETCHUP PLASTIC', size: '14 OZ' }] }, 'shelf')
      tx.oncomplete = resolve
      tx.onerror = reject
    }
  }))
  await page.reload()
  await expect(page.getByTestId('plan-name')).toHaveText('My old shelf')
  await expect(rows(page)).toHaveCount(1)
  expect(await shelfNames(page, 'Shelf 1')).toEqual(['HNZ KETCHUP PLASTIC'])
})

const PHOTO_PACK = path.resolve('../data/build/photos-test.json') // made by scripts/make_photo_pack.py
const SYNTHETIC = path.resolve('../data/build/photos/synthetic-bottle.png')

test('photo pack: pictures show on the shelf and in the list', async ({ page }) => {
  test.skip(!fs.existsSync(PHOTO_PACK), 'no test photo pack')
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(PHOTO_PACK)
  await expect(page.getByRole('dialog')).toContainText('Photo pack loaded: 1 new photo')
  await page.getByRole('button', { name: 'Done' }).click()
  // FDC KETCHUP SQZ UPSIDE DWN 20 oz is on shelf 3 with 2 facings: both show the picture
  const tile = page.locator('.tile.has-photo')
  await expect(tile).toHaveCount(1)
  await expect(tile.locator('img')).toHaveCount(2)
  await openShelf(page, 3)
  await expect(page.locator('.frow-thumb')).toHaveCount(1) // and in that shelf's list
  await shot(page, '10-photo-on-shelf')
  await page.reload() // photos are saved on the phone
  await expect(page.locator('.tile.has-photo img')).toHaveCount(2)
})

test('add a photo from the phone to a product', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await page.getByTestId('photo-input').setInputFiles(SYNTHETIC)
  await expect(page.locator('.toast')).toContainText('Photo saved')
  await expect(page.locator('.photo-slot img')).toHaveCount(1)
  // trimmed to the bottle: taller than wide, at most 400 px
  const size = await page.locator('.photo-slot img').evaluate((img) => [img.naturalWidth, img.naturalHeight])
  expect(size[1]).toBe(400)
  expect(size[0]).toBeLessThan(200)
  await expect(rows(page).nth(0).locator('.tile.has-photo')).toHaveCount(1)
  await shot(page, '11-added-photo')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.locator('.tile.has-photo')).toHaveCount(0)
})

const MEASURE = path.resolve('../data/build/photos/measure-test.png')

test('edit a product size: saved everywhere, marks change from ~ to measured', async ({ page }) => {
  await loadData(page)
  const tile = rows(page).nth(0).getByTestId('tile').nth(0)
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await page.getByTestId('edit-size').click()
  await page.getByTestId('size-w').fill('4')
  await page.getByTestId('size-h').fill('9')
  await page.getByTestId('size-d').fill('2.5')
  await shot(page, '12-size-sheet')
  await page.getByTestId('save-size').click()
  await expect(page.locator('.toast')).toContainText('Size saved')
  await expect(tile.locator('.guess-mark')).toHaveCount(0) // all three measured: no ~
  await expect(page.getByTestId('selected-panel')).toContainText('2 × 4 in = 8 in wide')
  await page.reload()
  await expect(rows(page).nth(0).getByTestId('tile').nth(0).locator('.guess-mark')).toHaveCount(0)
})

test('change the default guesses for a package type', async ({ page }) => {
  await loadData(page)
  // a squeeze bottle with no AFI size, so its size is a guess
  await page.getByTestId('open-add').click()
  await page.getByTestId('search-input').fill('021000026876') // KRAFT MAYO SQUEEZE 12 OZ
  await page.getByTestId('add-result').first().click()
  const tile = page.locator('.tile.selected')
  const firstRow = page.getByTestId('item-list').getByTestId('frow').filter({ hasText: 'KRAFT MAYO SQUEEZE' }).locator('.row-sub')
  await expect(firstRow).toContainText('~2.3 in') // guess: 2.75 in at 20 oz -> 2.25 in at 12 oz (list rounds to 0.1)
  await page.getByTestId('open-shelf').click()
  await page.getByTestId('open-guesses').click()
  await page.getByTestId('guess-squeeze-w').fill('4')
  await page.getByTestId('save-guesses').click()
  await expect(firstRow).toContainText('~3.3 in') // 4 in at 20 oz -> 3.25 in at 12 oz
  await expect(tile.locator('.guess-mark')).toHaveText('~') // still a guess
})

test('measure a product from a photo', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await page.getByTestId('edit-size').click()
  await page.getByTestId('open-measure').click()
  await page.getByTestId('measure-photo').setInputFiles(MEASURE)
  const img = page.getByTestId('measure-area').locator('img')
  await expect(img).toBeVisible()
  const tap = async (x, y) => {
    const b = await img.boundingBox()
    await page.mouse.click(b.x + (x / 1000) * b.width, b.y + (y / 600) * b.height)
  }
  await page.getByRole('button', { name: 'Shelf 48' }).click()
  await tap(20, 508); await tap(980, 508)   // the 48 in shelf edge
  await tap(400, 300); await tap(455, 300)  // product left and right
  await tap(428, 160); await tap(428, 500)  // product top and bottom
  await expect(page.getByTestId('measure-result')).toContainText('≈2.75 in')
  await expect(page.getByTestId('measure-result')).toContainText('≈17 in')
  await shot(page, '13-measure')
  await page.getByTestId('use-measure').click()
  await expect(page.getByTestId('size-w')).toHaveValue('2.75')
  await page.getByTestId('save-size').click()
  await expect(rows(page).nth(0).getByTestId('tile').nth(0).locator('.guess-mark')).toHaveText('≈') // depth: AFI's estimate
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByTestId('selected-panel')).toContainText('W from photo · H from photo · D estimated from AFI shelf count')
})

test('a size pack updates products but never overwrites a tape measurement', async ({ page }) => {
  await loadData(page)
  const pack = {
    kind: 'shelf-planner-sizes', version: 1,
    sizes: { '041500000527': { w: { v: 2.6, src: 'photo' }, h: { v: 7.25, src: 'photo' }, updatedAt: '2026-10-15T00:00:00Z' } },
  }
  const file = path.join(SHOTS, '..', 'test-sizes.json')
  fs.writeFileSync(file, JSON.stringify(pack))
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(file)
  await expect(page.getByRole('dialog')).toContainText('Size pack loaded: 1 product updated (1 of 1')
})

const AISLE = path.resolve('../data/build/aisle/aisle-plans-backup.json') // from CJ's aisle photos (private)

test('the laundry aisle recreated from photos imports as 4 plans with photo sizes', async ({ page }) => {
  test.skip(!fs.existsSync(AISLE), 'no aisle file')
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(AISLE)
  await expect(page.getByRole('dialog')).toContainText('Backup loaded: 4 new plans')
  for (const [name, file] of [['Laundry A', 'A'], ['Laundry B', 'B'], ['Laundry C', 'C'], ['Laundry D', 'D']]) {
    if (!(await page.getByRole('dialog').isVisible())) await page.getByRole('button', { name: 'Plans', exact: true }).click()
    await page.getByTestId('plan-list').locator('li').filter({ hasText: name }).getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByTestId('plan-name')).toContainText(name)
    await expect(rows(page)).toHaveCount(6)
    await shot(page, `20-aisle-${file}`)
    await page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-20-aisle-${file}-full.png`), fullPage: true })
  }
  // photo sizes are in use: Faultless starch width comes from the photo
  await page.locator('[data-testid="tile"][data-name^="FAULTLESS STARCH FRESH"]').first().click()
  await expect(openRow(page).getByTestId('row-facings')).toHaveText('5')
  await expect(openRow(page)).toContainText('≈13 in wide') // ≈ = width from a photo
})

test('stack a product 2 high and leave an empty space on a shelf', async ({ page }) => {
  await loadData(page)
  const tile = rows(page).nth(0).getByTestId('tile').nth(0)
  await openProduct(page, 0, 0)
  const h1 = (await tile.boundingBox()).height
  await openRow(page).getByTestId('details').click()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: 'Stack one more high' }).click()
  await expect(page.getByTestId('high')).toHaveText('2 high')
  await expect.poll(async () => (await tile.boundingBox()).height).toBeGreaterThan(h1 * 1.8) // drawn twice as tall
  await expect(openRow(page)).toContainText('2 high')
  await page.getByTestId('selected-panel').getByRole('button', { name: 'Close' }).click()
  // empty space after the selected product
  const usedBefore = await page.getByTestId('focus-left').innerText()
  await page.getByTestId('open-add').click()
  await page.getByTestId('add-gap').click()
  await expect(openRow(page)).toContainText('Empty space')
  await expect(rows(page).nth(0).getByTestId('gap')).toHaveCount(1)
  for (let i = 0; i < 2; i++) await openRow(page).getByRole('button', { name: 'Half an inch wider' }).click()
  await expect(openRow(page).getByTestId('gap-width')).toHaveText('3')
  const used = (s) => Number(s.match(/([\d.]+) of 48/)[1])
  const usedAfter = await page.getByTestId('focus-left').innerText()
  expect(used(usedAfter) - used(usedBefore)).toBeCloseTo(3, 1) // the empty space takes 3 in
  await shot(page, '21-stack-and-gap')
  // positions skip the empty space: the product after it is still #2
  await expect(page.getByTestId('shelf-rows').locator('.row-pos').nth(2)).toHaveText('2')
  await openRow(page).getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(rows(page).nth(0).getByTestId('gap')).toHaveCount(0)
  expect(await trayNames(page)).toHaveLength(2) // the empty space did not go to the tray
})

test('print: make a PDF with the drawing and the product list, and a picture', async ({ page }, info) => {
  await loadData(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-print').click()
  await page.getByTestId('make-pdf').click()
  await expect(page.getByTestId('print-ready')).toContainText('Ready: 3 pages') // drawing + 2 list pages
  await shot(page, '22-print-ready')
  const dl = page.waitForEvent('download')
  await page.getByTestId('save-pdf').click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/^ketchup-mustard-afi-2024-01-09-\d{4}-\d\d-\d\d\.pdf$/)
  await file.saveAs(path.join(SHOTS, `${info.project.name}-22-plan.pdf`))
  const head = fs.readFileSync(path.join(SHOTS, `${info.project.name}-22-plan.pdf`)).subarray(0, 8).toString()
  expect(head).toBe('%PDF-1.4')
  const dl2 = page.waitForEvent('download')
  await page.getByTestId('save-png').click()
  await (await dl2).saveAs(path.join(SHOTS, `${info.project.name}-22-plan-page1.png`))
})

test('compare a proposed copy with the current plan, and print the change list', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByTestId('plan-name')).toContainText('(copy)')
  const top = await shelfNames(page, 'Shelf 7 (top)')
  // proposed: take the first product off, add a facing to the next one
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-compare').click()
  await page.getByTestId('compare-with').selectOption({ label: 'Ketchup - Mustard (AFI 2024-01-09)' })
  const result = page.getByTestId('compare-result')
  await expect(result).toContainText('Take out (1)')
  await expect(result).toContainText(top[0])
  await expect(result).toContainText('Change facings (1)')
  await expect(result).toContainText(top[1])
  await expect(result).not.toContainText('Slide along') // the rest kept their order
  await expect(result).not.toContainText('Move to another shelf')
  await shot(page, '23-compare')
  await page.getByTestId('print-changes').click()
  await expect(page.getByTestId('print-compare')).toHaveValue(/.+/)
  await page.getByTestId('make-pdf').click()
  await expect(page.getByTestId('print-ready')).toContainText('Ready: 4 pages') // drawing, 2 list pages, change list
  const dl = page.waitForEvent('download')
  await page.getByTestId('save-pdf').click()
  await (await dl).saveAs(path.join(SHOTS, `${test.info().project.name}-23-changes.pdf`))
})

test('sales help: load a CSV export, money columns are ignored, worth-a-look lists appear', async ({ page }) => {
  await loadData(page)
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
  const reset = cat.resets.find((r) => /KETCHUP/i.test(r.name))
  const items = reset.shelves.flatMap((s) => s.items).filter((i) => i.status !== 'notFound')
  // first product sells fast, one sells nothing, the rest a few; written the way BRData prints UPCs (11 digits)
  const lines = ['UPC,Description,Unt/Lbs,Sales $,GM%,On Hand']
  items.forEach((it, k) => lines.push(`${it.upc.slice(0, 11)},"${it.description}",${k === 0 ? 900 : k === 1 ? 0 : 20 + k},${(k + 1) * 11.11},25.5,-3`))
  const csv = path.join(SHOTS, 'test-sales.csv')
  fs.writeFileSync(csv, lines.join('\n'))
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-sales').click()
  await page.getByTestId('movement-file').setInputFiles(csv)
  await expect(page.getByRole('dialog')).toContainText('from the “Unt/Lbs” column')
  await page.getByRole('button', { name: '13 weeks' }).click()
  await page.getByTestId('movement-save').click()
  await expect(page.getByTestId('movement-period')).toContainText('13 weeks')
  await expect(page.getByTestId('tips-best')).toContainText(items[0].description)
  await expect(page.getByTestId('tips-nosales')).toContainText(items[1].description)
  await shot(page, '24-sales-help')
  await page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-24-sales-help-full.png`), fullPage: true })
  // nothing about money was saved on the phone
  const saved = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('shelf-planner', 1)
    req.onsuccess = () => {
      const get = req.result.transaction('kv').objectStore('kv').get('movement')
      get.onsuccess = () => resolve(JSON.stringify(get.result))
    }
  }))
  expect(saved).toContain('"units":900')
  expect(saved).not.toMatch(/11\.11|25\.5|:-3|Sales \$|GM|On Hand/i)
  // tapping a product shows it on its shelf; Details has its pace
  await page.getByTestId('tips-best').locator('.row').first().click()
  await expect(openRow(page)).toContainText(items[0].description)
  await openRow(page).getByTestId('details').click()
  await expect(page.getByTestId('sells')).toContainText('sells ~69/wk') // 900 / 13 weeks
  await page.reload()
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await expect(page.getByTestId('sells')).toBeVisible() // still loaded after closing the app
})

const MOVEMENT = path.resolve('../data/build/movement.json') // units sold read from CJ's BRData scan (private)

test('sales help with the real movement file on the Ketchup-Mustard set', async ({ page }) => {
  test.skip(!fs.existsSync(MOVEMENT), 'no movement file')
  await loadData(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-sales').click()
  await page.getByTestId('movement-file').setInputFiles(MOVEMENT)
  await expect(page.getByRole('dialog')).toContainText('Sales file loaded')
  await expect(page.getByTestId('movement-period')).toContainText('15.6 weeks')
  await shot(page, '25-sales-real')
  const text = await page.getByRole('dialog').innerText()
  fs.writeFileSync(path.join(SHOTS, `${test.info().project.name}-25-sales-real.txt`), text)
})

test('reminders and shortcuts: backup reminder, "in this plan" in search, copy from Compare', async ({ page }, info) => {
  await loadData(page)
  await expect(page.getByTestId('backup-due')).toHaveCount(0) // nothing changed yet
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  await expect(page.getByTestId('backup-due')).toContainText('not backed up yet')
  if (info.project.name === 'desktop') {
    const dl = page.waitForEvent('download')
    await page.getByTestId('backup-now').click()
    await dl
    await expect(page.getByTestId('backup-due')).toHaveCount(0)
  }
  // search marks products already in the plan
  await page.getByTestId('open-add').click()
  await page.getByTestId('search-input').fill('frenchs mustard squeeze honey')
  await expect(page.locator('.results li').first()).toContainText('in this plan: Shelf 7 (top), #1')
  await page.getByRole('button', { name: 'Done' }).click()
  // Compare with only one plan: one tap makes the copy and comes back
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-compare').click()
  await page.getByTestId('compare-copy').click()
  await expect(page.getByTestId('plan-name')).toContainText('(copy)')
  await expect(page.getByTestId('compare-result')).toContainText('No changes')
})

test('importing an older backup keeps the newer store data on the phone', async ({ page }) => {
  await loadData(page)
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
  const old = { ...cat, built: '2000-01-01', items: cat.items.slice(0, 5), resets: cat.resets.slice(0, 1) }
  const backup = { kind: 'shelf-planner-backup', version: 1, exportedAt: '2000-01-01T00:00:00Z', plans: [], catalog: old, photos: {}, sizes: {}, guessEdits: {} }
  const file = path.join(SHOTS, 'old-backup.json')
  fs.writeFileSync(file, JSON.stringify(backup))
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(file)
  await expect(page.getByRole('dialog')).toContainText('Backup loaded')
  await expect(page.getByRole('dialog')).not.toContainText('store data updated')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-shelf').click()
  await expect(page.getByRole('dialog')).toContainText(`Store data: ${cat.items.length.toLocaleString('en-US')} products`)
})

test('real sizes from the AFI drawings: used for products, and AFI stacking comes along', async ({ page }) => {
  await loadData(page)
  // Ketchup-Mustard: every product now has AFI's width and height (no ~ guess marks, depth ≈ estimated)
  await expect(await openStatus(page)).not.toContainText('~ = guessed size')
  await page.getByRole('button', { name: 'Done' }).click()
  await openProduct(page, 0, 0)
  await openRow(page).getByTestId('details').click()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByTestId('selected-panel')).toContainText('W from AFI planogram · H from AFI planogram · D estimated from AFI shelf count')
  await expect(page.getByTestId('selected-panel')).toContainText('3.06 W × 6.64 H')
  // Pickles-Relish: AFI stacks the 24 oz Vlasic jars 2 high
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-afi').click()
  await page.getByTestId('afi-01-08-24_PICKLES-RELISH').click()
  await page.locator('[data-testid="tile"][data-name="VLASIC KOSHER DILL BABY WHOLE"]').first().click()
  await expect(openRow(page)).toContainText('2 high')
  await shot(page, '28-afi-sizes')
})

test('aisle: the 4 laundry sections side by side, drag a product from A into B, and B keeps it', async ({ page }, info) => {
  test.skip(!fs.existsSync(AISLE), 'no aisle file')
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(AISLE)
  await expect(page.getByRole('dialog')).toContainText('Backup loaded: 4 new plans')
  await page.getByTestId('aisle-list').locator('li').filter({ hasText: 'Laundry aisle' }).getByTestId('open-aisle').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Laundry aisle')
  await expect(await openStatus(page)).toContainText('4 sections · 24 shelves')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(rows(page)).toHaveCount(6) // 6 levels, each with 4 shelves side by side
  await expect(rows(page).nth(5).getByTestId('board-label')).toHaveCount(4)
  await shot(page, '29-aisle')
  // drag the last product of A's bottom shelf to the start of B's bottom shelf
  const bottom = rows(page).nth(5)
  const aTiles = bottom.locator('.shelf-canvas').nth(0).getByTestId('tile')
  const bTiles = bottom.locator('.shelf-canvas').nth(1).getByTestId('tile')
  const lastA = aTiles.last()
  const name = (await lastA.getAttribute('aria-label')).split(': ')[1].split(',')[0]
  await lastA.scrollIntoViewIfNeeded()
  const from = await center(lastA)
  const b0 = await bTiles.first().boundingBox()
  await drag(page, info, from, { x: b0.x + 3, y: b0.y + b0.height / 2 })
  await expect(bTiles.first()).toHaveAttribute('aria-label', new RegExp(`^B · Shelf 1 \\(bottom\\), position 1: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  const moved = await bTiles.first().getAttribute('data-name')
  // open Laundry B on its own: the product is there, first after the 9 in empty space; and gone from A
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('plan-list').locator('li').filter({ hasText: 'Laundry B' }).getByRole('button', { name: 'Open', exact: true }).click()
  expect((await shelfNames(page, 'Shelf 1 (bottom)')).filter((n) => n !== 'Empty space')[0]).toBe(moved)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('plan-list').locator('li').filter({ hasText: 'Laundry A' }).getByRole('button', { name: 'Open', exact: true }).click()
  expect(await shelfNames(page, 'Shelf 1 (bottom)')).not.toContain(moved)
  // and back in the aisle after a reload
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('aisle-list').locator('li').filter({ hasText: 'Laundry aisle' }).getByTestId('open-aisle').click()
  await page.reload()
  await expect(page.getByTestId('plan-name')).toHaveText('Laundry aisle')
})

test('aisle: make one from two plans; print makes pages for each section', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-afi').click()
  await page.getByTestId('afi-01-08-24_PICKLES-RELISH').click()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('new-aisle').click()
  const pick = (t) => page.getByTestId('make-aisle').locator('.row').filter({ hasText: t }).click()
  await pick('Ketchup'); await pick('Pickles')
  await page.getByTestId('aisle-name').fill('Condiments')
  await page.getByTestId('save-aisle').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Condiments')
  await expect(rows(page).first().getByTestId('board-label').first()).toContainText('A · Shelf 7')
  await page.getByTestId('open-tools').click()
  await expect(page.getByTestId('tool-compare')).toHaveCount(0) // compare is for single plans
  await page.getByTestId('tool-print').click()
  await page.getByTestId('make-pdf').click()
  await expect(page.getByTestId('print-ready')).toContainText(/Ready: [6-9] pages/) // each section's drawing and list
})

test('a two-door freezer set opens as an aisle, one 30 in section per door', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-afi').click()
  await page.getByTestId('reset-search').fill('banquet')
  await expect(page.locator('[data-testid^="afi-"]')).toHaveCount(1)
  await expect(page.locator('[data-testid^="afi-"]')).toContainText('2 freezer doors · 5 ft · 6 shelves')
  await page.locator('[data-testid^="afi-"]').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Banquet Dinners (AFI 2024-02-02)')
  await expect(await openStatus(page)).toContainText('2 sections · 12 shelves')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(rows(page).first().getByTestId('board-label')).toHaveCount(2) // door 1 and door 2 side by side
  await expect(rows(page).first().getByTestId('board-label').first()).toContainText('A · Shelf 6')
  await shot(page, '30-freezer')
})

test('opens with no signal after being opened once online', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length)).toBeGreaterThan(5)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Load your store data')).toBeVisible() // the app itself opened from the phone
  await context.setOffline(false)
})

test('zoomed in: dragging a product onto the shelf above keeps you there; moving keeps ▲ ▼ reachable', async ({ page }, info) => {
  await loadData(page)
  await openShelf(page, 6)
  const six = await shelfNames(page, 'Shelf 6')
  const from = await center(rows(page).nth(1).getByTestId('tile').nth(0))
  const above = await rows(page).nth(0).locator('.shelf-canvas').boundingBox() // the peek of shelf 7
  await drag(page, info, from, { x: above.x + above.width - 20, y: above.y + above.height - 6 })
  expect((await shelfNames(page, 'Shelf 7 (top)')).length).toBe(11)
  expect(await shelfNames(page, 'Shelf 6')).toEqual(six.slice(1))
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 7 (top)') // follows the product, no extra jump
  await settled(page)
  // Details > Move, then ▼ twice and tap that shelf: the product goes there
  await page.locator('.frow.open').getByTestId('details').click()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await page.getByTestId('shelf-down').click()
  await page.getByTestId('shelf-down').click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 5')
  await settled(page)
  const five = await rows(page).nth(2).locator('.shelf-canvas').boundingBox()
  await page.mouse.click(five.x + five.width - 30, five.y + five.height / 2)
  expect((await shelfNames(page, 'Shelf 5')).at(-1)).toBe(six[0])
})

test('take off, then Undo on the message puts it back', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.toast')).toContainText('Undone')
  expect(await shelfNames(page, 'Shelf 7 (top)')).toEqual(top)
})

test('the ends of a shelf and of the set: those arrows are off', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 0, 0) // first product on the top shelf
  await expect(openRow(page).getByRole('button', { name: 'Move left' })).toBeDisabled()
  await expect(openRow(page).getByRole('button', { name: 'Move up a shelf' })).toBeDisabled()
  await expect(openRow(page).getByRole('button', { name: 'Move right' })).toBeEnabled()
  await expect(page.getByTestId('shelf-up')).toBeDisabled()
  await expect(page.getByTestId('shelf-up')).toContainText('Top')
})

test('phone: the whole set fits on the screen without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone screen')
  await loadData(page)
  await expect(rows(page)).toHaveCount(7)
  const fits = await page.getByTestId('d-window').evaluate((el) => el.scrollHeight <= el.clientHeight + 2)
  expect(fits).toBe(true)
  for (const r of await rows(page).all()) await expect(r).toBeInViewport()
})

test('aisle: the shelf buttons stay in the section you are on', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('tab-afi').click()
  await page.getByTestId('afi-01-08-24_PICKLES-RELISH').click()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByTestId('new-aisle').click()
  const pick = (t) => page.getByTestId('make-aisle').locator('.row').filter({ hasText: t }).click()
  await pick('Ketchup'); await pick('Pickles')
  await page.getByTestId('aisle-name').fill('Condiments')
  await page.getByTestId('save-aisle').click()
  await rows(page).nth(0).getByTestId('board-label').first().click() // A, top shelf
  await expect(page.getByTestId('focus-name')).toHaveText('A · Shelf 7 (top)')
  for (let i = 0; i < 6; i++) await page.getByTestId('shelf-down').click()
  await expect(page.getByTestId('focus-name')).toHaveText('A · Shelf 1 (bottom)') // never jumps into section B
  await expect(page.getByTestId('shelf-down')).toBeDisabled()
})
