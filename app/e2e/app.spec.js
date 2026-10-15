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

/** Product names on one shelf, from the list under the drawing (e.g. "Shelf 7 (top)"). */
const shelfNames = (page, label) =>
  page.getByTestId('item-list').locator('section').filter({ has: page.locator('h2', { hasText: label }) })
    .locator('.row-name').allInnerTexts()
const trayNames = (page) => page.getByTestId('tray').locator('.row-name').allInnerTexts()
const rows = (page) => page.getByTestId('shelf-row') // top shelf first

async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('summary')).toBeVisible()
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

test('a quick swipe scrolls instead of dragging', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only')
  await loadData(page)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  const before = await shelfNames(page, 'Shelf 7 (top)')
  const scroller = page.getByTestId('section-scroll')
  const startLeft = await scroller.evaluate((el) => el.scrollLeft)
  const t = await center(rows(page).nth(0).getByTestId('tile').nth(1))
  await fingerDrag(page, { x: 330, y: t.y }, { x: 60, y: t.y }, { hold: 30, steps: 8 })
  await page.waitForTimeout(400)
  expect(await shelfNames(page, 'Shelf 7 (top)')).toEqual(before)
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(startLeft)
  await shot(page, '03-zoomed')
})

test('tap a product, tap Move, tap another shelf', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await expect(page.getByTestId('selected-panel')).toContainText(top[0])
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByText('Tap a shelf where it should go.')).toBeVisible()
  await shot(page, '04-move-mode')
  // scroll shelf 4 into view above the selected-product bar, like a person would
  await rows(page).nth(3).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const t = await rows(page).nth(3).getByTestId('tile').nth(0).boundingBox() // shelf 4, before its first product
  await page.mouse.click(t.x + 2, t.y + t.height / 2)
  expect((await shelfNames(page, 'Shelf 4'))[0]).toBe(top[0])
})

test('take off, the tray, put back, and delete', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 'Shelf 7 (top)')
  await rows(page).nth(0).getByTestId('tile').nth(1).click()
  await page.getByRole('button', { name: 'Take off' }).click()
  expect((await trayNames(page))[0]).toBe(top[1])
  expect(await shelfNames(page, 'Shelf 7 (top)')).toHaveLength(top.length - 1)
  await shot(page, '05-tray')
  await page.getByRole('button', { name: 'Put on shelf' }).click()
  await page.getByTestId('shelf-head').nth(2).click() // tapping a shelf's heading puts it at the end
  expect((await shelfNames(page, 'Shelf 5')).at(-1)).toBe(top[1])
  // delete for good from the tray
  await page.getByTestId('tray').locator('.row').first().click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  expect(await trayNames(page)).toHaveLength(1)
})

test('facings, OVER on one shelf, undo/redo, and it survives a reload', async ({ page }) => {
  await loadData(page)
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  const facings = page.getByTestId('facings')
  const start = Number(await facings.innerText())
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'One more facing' }).click()
  await expect(facings).toHaveText(String(start + 8))
  await expect(rows(page).nth(0).getByTestId('shelf-left')).toContainText('OVER')
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
  await shot(page, '06-over')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(facings).toHaveText(String(start + 7))
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(facings).toHaveText(String(start + 8))
  await page.reload()
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
})

test('search by name and by UPC, add to the shelf you tapped', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('shelf-head').nth(6).click() // bottom shelf
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
  page.on('dialog', (d) => d.accept())
  await loadData(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByTestId('plan-name')).toContainText('(copy)')
  // change the copy so the two differ
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await page.getByRole('button', { name: 'Take off' }).click()
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
  await page.getByTestId('afi-01-08-24_PICKLES-RELISH').click()
  await expect(page.getByTestId('plan-name')).toContainText('Pickles')
  await expect(rows(page)).toHaveCount(7)
  await shot(page, '09-pickles-8ft')
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(3)
  await page.getByRole('button', { name: /Delete Pickles/ }).click()
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(2)
})

test('shelf size for one shelf or all, add and remove a shelf', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('shelf-head').nth(0).click()
  await page.getByRole('button', { name: 'Shelf', exact: true }).click()
  await page.getByTestId('field-clearanceIn').fill('9')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('section-status')).toHaveText('Width fits') // tall bottles no longer clear 9 in
  await expect(page.getByTestId('summary')).toContainText('taller than the clearance')
  await page.getByRole('button', { name: 'Shelf', exact: true }).click()
  await page.getByRole('button', { name: '36', exact: true }).click()
  await page.getByLabel('Use these sizes for every shelf').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows(page).nth(6).getByTestId('shelf-head')).toContainText('of 36 ·')
  await page.getByRole('button', { name: 'Shelf', exact: true }).click()
  await page.getByRole('button', { name: 'Add a shelf on top' }).click()
  await expect(rows(page)).toHaveCount(8)
  await page.getByRole('button', { name: 'Shelf', exact: true }).click()
  await page.getByRole('button', { name: 'Remove this shelf' }).click()
  await expect(rows(page)).toHaveCount(7)
})

test('export a backup, then load it on a fresh phone', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'file download checked on desktop')
  await loadData(page)
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await page.getByTestId('photo-input').setInputFiles(path.resolve('../data/build/photos/synthetic-bottle.png'))
  await expect(page.locator('.toast')).toContainText('Photo saved')
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
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
  await expect(p2.getByTestId('summary')).toBeVisible()
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
  await expect(page.locator('.row-thumb')).toHaveCount(1)
  await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await tile.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
  await shot(page, '10-photo-on-shelf')
  await page.reload() // photos are saved on the phone
  await expect(page.locator('.tile.has-photo img')).toHaveCount(2)
})

test('add a photo from the phone to a product', async ({ page }) => {
  await loadData(page)
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
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
  await tile.click()
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
  const tile = rows(page).nth(0).getByTestId('tile').nth(0) // FRENCHS MUSTARD SQUEEZE HONEY 12 oz, 2 facings
  const firstRow = page.getByTestId('item-list').locator('section').filter({ has: page.locator('h2', { hasText: 'Shelf 7 (top)' }) }).locator('.row-sub').first()
  await expect(firstRow).toContainText('~4.5 in') // 2 x 2.25 in guess
  await page.getByRole('button', { name: 'Shelf', exact: true }).click()
  await page.getByTestId('open-guesses').click()
  await page.getByTestId('guess-squeeze-w').fill('4')
  await page.getByTestId('save-guesses').click()
  await expect(firstRow).toContainText('~6.5 in') // 4 in at 20 oz -> 3.25 in at 12 oz, x 2
  await expect(tile.locator('.guess-mark')).toHaveText('~') // still a guess
})

test('measure a product from a photo', async ({ page }) => {
  await loadData(page)
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
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
  await expect(rows(page).nth(0).getByTestId('tile').nth(0).locator('.guess-mark')).toHaveText('~') // depth still a guess
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByTestId('selected-panel')).toContainText('W from photo · H from photo · D guess')
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
  const row = page.getByTestId('item-list').locator('.row').filter({ hasText: 'FAULTLESS STARCH FRESH' }).first()
  await expect(row).toContainText('5 facings · ≈13 in') // ≈ = width from a photo
})

test('stack a product 2 high and leave an empty space on a shelf', async ({ page }) => {
  await loadData(page)
  const tile = rows(page).nth(0).getByTestId('tile').nth(0)
  const h1 = (await tile.boundingBox()).height
  await tile.click()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: 'Stack one more high' }).click()
  await expect(page.getByTestId('high')).toHaveText('2 high')
  await expect.poll(async () => (await tile.boundingBox()).height).toBeGreaterThan(h1 * 1.8) // drawn twice as tall
  await expect(page.getByTestId('item-list').locator('.row.selected')).toContainText(', 2 high')
  // empty space after the selected product
  const leftBefore = await rows(page).nth(0).getByTestId('shelf-left').innerText()
  await page.getByTestId('open-add').click()
  await page.getByTestId('add-gap').click()
  await expect(page.getByTestId('selected-panel')).toContainText('Empty space')
  await expect(rows(page).nth(0).getByTestId('gap')).toHaveCount(1)
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Half an inch wider' }).click()
  await expect(page.getByTestId('gap-width')).toHaveText('3')
  const n = (s) => Number(s.match(/[\d.]+/)[0])
  const leftAfter = await rows(page).nth(0).getByTestId('shelf-left').innerText()
  expect(n(leftBefore) - n(leftAfter)).toBeCloseTo(3, 1) // 3 in less room
  await shot(page, '21-stack-and-gap')
  // positions skip the empty space: the product after it is still #2
  await expect(page.getByTestId('item-list').locator('section').filter({ has: page.locator('h2', { hasText: 'Shelf 7 (top)' }) })
    .locator('.row-pos').nth(2)).toHaveText('2')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
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
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await page.getByRole('button', { name: 'Take off' }).click()
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await page.getByRole('button', { name: 'One more facing' }).click()
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
  // tapping a product shows it on the shelf with its pace
  await page.getByTestId('tips-best').locator('.row').first().click()
  await expect(page.getByTestId('sells')).toContainText('sells ~69/wk') // 900 / 13 weeks
  await page.reload()
  await rows(page).nth(0).getByTestId('tile').nth(0).click()
  await expect(page.getByTestId('sells')).toBeVisible() // still loaded after closing the app
})
