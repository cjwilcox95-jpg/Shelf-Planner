// The everyday actions of the app, tested on made-up demo products (e2e/fixtures/demo-catalog.json), so these
// tests run on any computer: no private store data is needed. Remake the demo file with
//   node e2e/make-demo-catalog.mjs
// The demo "Ketchup Mustard" set: 5 shelves of 4 ft (Shelf 5 is the top), 3 products off the shelf.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const CATALOG = path.resolve('e2e/fixtures/demo-catalog.json')
const demo = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))

const rows = (page) => page.getByTestId('shelf-row') // top shelf first
const openRow = (page) => page.locator('.frow.open')
const done = (page) => page.getByRole('button', { name: 'Done' }).click()

async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('status-pill')).toBeVisible()
}
/** Product names on shelf n (1 = bottom), left to right, read from the drawing. */
async function shelfNames(page, n) {
  const total = await rows(page).count()
  return rows(page).nth(total - n).getByTestId('tile').evaluateAll((els) => els.map((e) => e.dataset.name))
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
/** Back to the whole set (if zoomed in to a shelf). */
async function wholeSet(page) {
  if (await page.getByTestId('whole-set').count()) await page.getByTestId('whole-set').click()
  await expect(page.getByTestId('whole-hint')).toBeVisible()
}
/** Zoom in to shelf n by tapping its board in the whole set. */
async function openShelf(page, n) {
  await wholeSet(page)
  const total = await rows(page).count()
  await rows(page).nth(total - n).getByTestId('board-label').first().click()
  await expect(page.getByTestId('focus-name')).toContainText(`Shelf ${n}`)
  await settled(page)
}
/** Tap product k of row r (top row = 0) in the whole set: zooms in with its row open. */
async function openProduct(page, r, k) {
  await wholeSet(page)
  await rows(page).nth(r).getByTestId('tile').nth(k).click()
  await expect(openRow(page)).toBeVisible()
  await settled(page)
}
/** What is off the shelf (opens and closes that list). */
async function trayNames(page) {
  await page.getByTestId('status-pill').click()
  if (!(await page.getByTestId('status-tray').count())) { await done(page); return [] }
  await page.getByTestId('status-tray').click()
  const names = await page.getByTestId('tray').locator('.row-name').allInnerTexts()
  await done(page)
  return names
}
const center = async (loc) => {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
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

test('first run: the whole set shows; tapping a shelf opens it; the buttons step up, down and back out', async ({ page }) => {
  await loadData(page)
  await expect(page.getByTestId('plan-name')).toHaveText('Ketchup Mustard (AFI 2026-03)')
  await expect(page.getByTestId('section-status')).toHaveText('Everything fits')
  await expect(rows(page)).toHaveCount(5)
  await expect(page.getByTestId('whole-hint')).toBeVisible()
  await expect(page.getByTestId('switcher')).toHaveCount(0) // the shelf buttons only show on a shelf
  await openShelf(page, 3)
  await expect(page.getByTestId('whole-hint')).toHaveCount(0)
  await page.getByTestId('shelf-up').click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 4')
  await page.getByTestId('shelf-down').click()
  await page.getByTestId('shelf-down').click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 2')
  await page.getByTestId('shelf-down').click()
  await expect(page.getByTestId('shelf-down')).toBeDisabled() // the bottom shelf
  await page.getByTestId('whole-set').click()
  await expect(page.getByTestId('whole-hint')).toBeVisible()
})

test('facings, OVER on one shelf, undo and redo, and it survives a reload', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 0, 0)
  const facings = openRow(page).getByTestId('row-facings')
  const start = Number(await facings.innerText())
  for (let i = 0; i < 12; i++) await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  await expect(facings).toHaveText(String(start + 12))
  await expect(page.getByTestId('focus-left')).toContainText('in over')
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
  await page.getByTestId('undo').click()
  await expect(facings).toHaveText(String(start + 11))
  await page.getByTestId('open-tools').click()
  await page.getByTestId('redo').click()
  await expect(facings).toHaveText(String(start + 12))
  await page.reload()
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
})

test('arrows move a product along a shelf and down a shelf; Details > Move puts it where you tap', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 5)
  const four = await shelfNames(page, 4)
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'Move right' }).click()
  expect((await shelfNames(page, 5)).slice(0, 2)).toEqual([top[1], top[0]])
  await expect(openRow(page).getByRole('button', { name: 'Move up a shelf' })).toBeDisabled() // already on the top shelf
  await openRow(page).getByRole('button', { name: 'Move down a shelf' }).click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 4') // the screen follows the product
  await expect(page.locator('.toast')).toContainText('Moved to Shelf 4')
  const fourAfter = await shelfNames(page, 4)
  expect(fourAfter).toHaveLength(four.length + 1)
  expect(fourAfter[1]).toBe(top[0]) // the same spot it had above
  // Details > Move, then tap the shelf near its right end: it goes to the end of that shelf
  await openRow(page).getByTestId('details').click()
  await expect(page.getByRole('dialog', { name: 'Product details' })).toBeVisible()
  await page.getByTestId('move-item').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Tap a shelf where it should go.')).toBeVisible()
  await settled(page)
  const box = await rows(page).nth(1).locator('.shelf-canvas').boundingBox()
  await page.mouse.click(box.x + box.width - 12, box.y + box.height / 2)
  expect((await shelfNames(page, 4)).at(-1)).toBe(top[0])
})

test('take off, the off-the-shelf list, put back, delete, and Undo on the message', async ({ page }) => {
  await loadData(page)
  const top = await shelfNames(page, 5)
  expect(await trayNames(page)).toHaveLength(3)
  await openProduct(page, 0, 1)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  expect(await shelfNames(page, 5)).toHaveLength(top.length - 1)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  expect(await shelfNames(page, 5)).toEqual(top)
  await openProduct(page, 0, 1)
  await openRow(page).getByRole('button', { name: 'Take off' }).click()
  expect(await trayNames(page)).toHaveLength(4)
  // put it on shelf 2: open that shelf, then the off-the-shelf list
  await openShelf(page, 2)
  const two = await shelfNames(page, 2)
  await page.getByTestId('open-tray').click()
  await page.getByTestId('tray').getByTestId('tray-row').first().getByRole('button', { name: /^Put on Shelf 2/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0) // the list closes so you see it land
  expect((await shelfNames(page, 2)).at(-1)).toBe(top[1])
  expect(await shelfNames(page, 2)).toHaveLength(two.length + 1)
  // delete one for good from the off-the-shelf list
  await page.getByTestId('open-tray').click()
  await page.getByTestId('tray').getByRole('button', { name: /^Delete / }).first().click()
  await done(page)
  expect(await trayNames(page)).toHaveLength(2)
})

test('add by name and by UPC to the shelf you are on; scan button; an empty space you can widen', async ({ page }) => {
  await loadData(page)
  await openShelf(page, 1)
  const before = await shelfNames(page, 1)
  await page.getByTestId('open-add').click()
  await expect(page.getByRole('dialog', { name: 'Add to Shelf 1 (bottom)' })).toBeVisible()
  const input = page.getByTestId('search-input')
  await input.fill('mayo copper')
  await expect(page.locator('.results .row-name').first()).toHaveText('Copper Pot Mayo Real')
  await input.fill('ketchup sunnyvale 64')
  await expect(page.locator('.results li').first()).toContainText('in this plan: Shelf 1 (bottom)')
  const mayo = demo.items.find((i) => i.description === 'COPPER POT MAYO REAL' && i.size === '30 OZ')
  await input.fill(mayo.upc.slice(1, 11))
  await expect(page.locator('.results li')).toHaveCount(1)
  await page.getByTestId('add-result').click()
  await expect(page.locator('.toast')).toContainText('Added to Shelf 1')
  expect((await shelfNames(page, 1)).at(-1)).toBe('COPPER POT MAYO REAL')
  expect(await shelfNames(page, 1)).toHaveLength(before.length + 1)
  // the scan button beside the search box opens the scanner
  await page.getByTestId('open-add').click()
  await page.getByTestId('open-scan').click()
  await expect(page.getByRole('dialog', { name: 'Scan a barcode' })).toBeVisible()
  await done(page)
  // an empty space: 2 in to start, then wider
  await page.getByTestId('open-add').click()
  await page.getByTestId('add-gap').click()
  await expect(page.locator('.toast')).toContainText('Empty space added')
  const gapRow = page.locator('.frow.is-gap')
  await expect(gapRow.getByTestId('gap-width')).toHaveText('2')
  await gapRow.getByRole('button', { name: 'Half an inch wider' }).click()
  await expect(gapRow.getByTestId('gap-width')).toHaveText('2.5')
})

test('details: one panel with the facts, stacking, a real size that sticks, and no duplicate buttons', async ({ page }) => {
  await loadData(page)
  await openProduct(page, 1, 0) // shelf 4
  const name = await openRow(page).locator('.row-name').innerText()
  await expect(openRow(page).locator('.row-sub')).toContainText('~') // a guessed size
  await openRow(page).getByTestId('details').click()
  const panel = page.getByTestId('selected-panel')
  await expect(panel).toContainText(name)
  await expect(panel).toContainText('Size from')
  await expect(panel.locator('button')).toHaveText(['−', '+', 'Edit size', 'Move']) // nothing the row already offers
  await panel.getByRole('button', { name: 'Stack one more high' }).click()
  await expect(panel.getByTestId('high')).toHaveText('2 high')
  // a real size, typed from a tape
  await panel.getByTestId('edit-size').click()
  await expect(page.getByRole('dialog', { name: 'Size & notes' })).toBeVisible()
  await expect(page.getByTestId('src-w')).toHaveValue('auto')
  await page.getByTestId('size-w').fill('4')
  await expect(page.getByTestId('src-w')).toHaveValue('measured') // typing a number marks it measured
  await page.getByTestId('size-h').fill('9 1/2')
  await page.getByTestId('size-d').fill('2.5')
  await page.getByTestId('save-size').click()
  await expect(page.locator('.toast')).toContainText('Size saved')
  await expect(panel.getByTestId('detail-width')).toHaveText('2 × 4 in = 8 in wide') // the details are back, with the new size (2 facings)
  await expect(panel).toContainText('measured')
  await done(page)
  await expect(openRow(page).locator('.row-sub')).not.toContainText('~')
  await expect(openRow(page).locator('.row-sub')).toContainText('2 high')
  await page.reload()
  await openProduct(page, 1, 0)
  await expect(openRow(page).locator('.row-sub')).not.toContainText('~')
  // back to the guess
  await openRow(page).getByTestId('details').click()
  await page.getByTestId('edit-size').click()
  for (const k of ['w', 'h', 'd']) await page.getByTestId(`src-${k}`).selectOption('auto')
  await page.getByTestId('save-size').click()
  await done(page)
  await expect(openRow(page).locator('.row-sub')).toContainText('~')
})

test('shelf size for one shelf or all, add and remove a shelf', async ({ page }) => {
  await loadData(page)
  await openShelf(page, 3)
  await page.getByTestId('open-shelf').click()
  const sheet = page.getByRole('dialog', { name: 'Shelf 3 size' })
  await expect(sheet.getByRole('button')).toHaveCount(16) // Done, 11 size chips, Save, add top, add bottom, remove
  await page.getByTestId('field-widthIn').fill('20')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('focus-left')).toContainText('in over of 20')
  await expect(page.getByTestId('section-status')).toHaveText('1 shelf over')
  await page.getByTestId('open-shelf').click()
  await page.getByTestId('field-widthIn').fill('96')
  await page.getByLabel('Use these sizes for every shelf in this section').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast')).toContainText('Every shelf updated')
  // no shelf is over now; the room above every shelf became shelf 3's 10 in, so the tall bottles are flagged instead
  await expect(page.getByTestId('section-status')).toHaveText('Width fits')
  await page.getByTestId('open-shelf').click()
  await page.getByRole('button', { name: 'Add a shelf on top' }).click()
  await wholeSet(page)
  await expect(rows(page)).toHaveCount(6)
  await openShelf(page, 6)
  await expect(page.getByTestId('shelf-empty')).toBeVisible()
  await page.getByTestId('open-shelf').click()
  await page.getByRole('button', { name: 'Remove this shelf' }).click()
  await wholeSet(page)
  await expect(rows(page)).toHaveCount(5)
})

test('plans: tap to open, ⋯ for copy, rename and delete; new empty section and new from an AFI set', async ({ page }) => {
  await loadData(page)
  const plans = page.getByTestId('plan-list').locator('li')
  await page.getByTestId('open-plans').click()
  await expect(plans).toHaveCount(1)
  await expect(plans.first()).toContainText('Open now')
  await expect(plans.first().getByRole('button', { name: 'Copy' })).toHaveCount(0) // tucked away until asked for
  await plans.first().getByTestId('entry-more').click()
  await plans.first().getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByTestId('plan-name')).toHaveText('Ketchup Mustard (AFI 2026-03) (copy)')
  // rename the copy
  await page.getByTestId('open-plans').click()
  await expect(plans).toHaveCount(2)
  const copy = plans.filter({ hasText: '(copy)' })
  await copy.getByTestId('entry-more').click()
  await copy.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Plan name').fill('Ketchup proposed')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(plans.filter({ hasText: 'Ketchup proposed' })).toContainText('Open now')
  // tap the other plan to open it
  await plans.filter({ hasText: 'AFI 2026-03' }).getByTestId('open-plan').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('plan-name')).toHaveText('Ketchup Mustard (AFI 2026-03)')
  // a new empty section
  await page.getByTestId('open-plans').click()
  await page.getByTestId('new-plan').click()
  await page.getByTestId('new-blank').click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: '36 in' }).click()
  await page.getByTestId('start-blank').click()
  await expect(page.getByTestId('plan-name')).toHaveText('New 3-shelf section')
  await expect(rows(page)).toHaveCount(3)
  // a new plan from an AFI set, found by name
  await page.getByTestId('open-plans').click()
  await page.getByTestId('tab-new').click()
  await page.getByTestId('reset-search').fill('pickles')
  await expect(page.locator('[data-testid^="afi-"]')).toHaveCount(1)
  await page.getByTestId('afi-demo-pickles').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Pickles Relish (AFI 2026-02)')
  await expect(rows(page)).toHaveCount(2)
  // delete the proposed plan, after an "are you sure"
  await page.getByTestId('open-plans').click()
  await expect(plans).toHaveCount(4)
  const victim = plans.filter({ hasText: 'Ketchup proposed' })
  await victim.getByTestId('entry-more').click()
  await victim.getByRole('button', { name: 'Delete Ketchup proposed' }).click()
  await page.getByTestId('confirm-yes').click()
  await expect(plans).toHaveCount(3)
  await expect(plans.filter({ hasText: 'Ketchup proposed' })).toHaveCount(0)
})

test('aisles: a two-door freezer set opens as an aisle; make one from two plans; rename and delete it', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('open-plans').click()
  await page.getByTestId('tab-new').click()
  await page.getByTestId('new-aisle').click()
  await expect(page.getByTestId('aisle-needs-two')).toBeVisible() // only one section so far
  await page.getByTestId('new-afi').click()
  await page.getByTestId('afi-demo-freezer').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Frozen Pizza Dinners (AFI 2026-01)')
  await expect(page.locator('.appbar-sub')).toContainText('Aisle · 2 sections')
  await expect(page.locator('.board-label').first()).toContainText('A · Shelf 2')
  // make an aisle from two plans
  await page.getByTestId('open-plans').click()
  await expect(page.getByTestId('aisle-list').locator('li')).toHaveCount(1)
  await page.getByTestId('tab-new').click()
  await page.getByTestId('new-aisle').click()
  const pick = (t) => page.getByTestId('make-aisle').locator('.row').filter({ hasText: t }).click()
  await pick('door 2')
  await pick('Ketchup Mustard')
  await page.getByTestId('aisle-name').fill('Mixed aisle')
  await page.getByTestId('save-aisle').click()
  await expect(page.getByTestId('plan-name')).toHaveText('Mixed aisle')
  // rename it, then delete it: its sections stay as plans
  await page.getByTestId('open-plans').click()
  const aisles = page.getByTestId('aisle-list').locator('li')
  await expect(aisles).toHaveCount(2)
  const mixed = aisles.filter({ hasText: 'Mixed aisle' })
  await expect(mixed).toContainText('Open now')
  await mixed.getByTestId('entry-more').click()
  await mixed.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Aisle name').fill('Condiments')
  await page.getByRole('button', { name: 'Save' }).click()
  const renamed = aisles.filter({ hasText: 'Condiments' })
  await renamed.getByTestId('entry-more').click()
  await renamed.getByRole('button', { name: 'Delete aisle Condiments' }).click()
  await page.getByTestId('confirm-yes').click() // the Plans panel is still open behind the question
  await expect(aisles).toHaveCount(1)
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(3) // the ketchup set and the two freezer doors
})

test('backup: export, then load it on a fresh phone; the import also takes a store-data file', async ({ page, browser }, info) => {
  await loadData(page)
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  const facings = await openRow(page).getByTestId('row-facings').innerText()
  await page.getByTestId('open-plans').click()
  await expect(page.getByTestId('backup-due')).toBeVisible() // changed and never backed up
  await page.getByTestId('tab-backup').click()
  await expect(page.getByTestId('store-info')).toHaveText(`Store data: ${demo.items.length} products, built 2026-01-01.`)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()])
  const file = info.outputPath('backup.json')
  await download.saveAs(file)
  await expect(page.getByTestId('backup-due')).toHaveCount(0)
  // a newer store-data file goes in through the same Import button; the message stays in the panel
  await page.getByTestId('import-file').setInputFiles(CATALOG)
  await expect(page.locator('.ok-msg')).toContainText(`Store data loaded: ${demo.items.length} products.`)
  // a fresh phone: the backup alone brings back the store data and the plan
  const ctx = await browser.newContext()
  const fresh = await ctx.newPage()
  await fresh.goto('./')
  await fresh.getByTestId('data-file').setInputFiles(file)
  await expect(fresh.getByTestId('plan-name')).toHaveText('Ketchup Mustard (AFI 2026-03)')
  await rows(fresh).nth(0).getByTestId('tile').nth(0).click()
  await expect(fresh.locator('.frow.open').getByTestId('row-facings')).toHaveText(facings)
  await ctx.close()
})

test('tools: one list without repeats; guesses, print, compare with a copy, sales help all open', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('open-tools').click()
  await expect(page.locator('.tool-title')).toHaveText(['Measure as you go', 'Print or save as PDF', 'Sales help', 'Compare with another plan', 'Shelf sizes', 'Default size guesses'])
  await expect(page.getByTestId('redo')).toBeDisabled() // nothing to redo yet
  await page.getByTestId('tool-guesses').click()
  await expect(page.getByRole('dialog', { name: 'Default size guesses' })).toBeVisible()
  await done(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-shelf').click()
  await expect(page.getByRole('dialog', { name: /Shelf \d.* size/ })).toBeVisible()
  await done(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-measure').click()
  await expect(page.getByTestId('mode-measure')).toHaveAttribute('aria-checked', 'true')
  await done(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-sales').click()
  await expect(page.getByRole('dialog', { name: 'Sales help' })).toBeVisible()
  await done(page)
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-print').click()
  await page.getByTestId('make-pdf').click()
  await expect(page.getByTestId('print-ready')).toContainText('Ready')
  await done(page)
  // compare: copy the plan, change the copy, see the change
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-compare').click()
  await page.getByTestId('compare-copy').click()
  await expect(page.getByTestId('plan-name')).toContainText('(copy)')
  await done(page)
  await openProduct(page, 0, 0)
  await openRow(page).getByRole('button', { name: 'One more facing' }).click()
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-compare').click()
  await expect(page.getByTestId('compare-result')).toContainText('1')
})

test('scan panel: typing the numbers finds a product in the plan and shows it on its shelf', async ({ page }) => {
  await loadData(page)
  const onShelf2 = demo.resets[0].shelves[1].items[3]
  await page.getByTestId('open-scan-bar').click()
  await page.getByTestId('scan-typed').fill(onShelf2.upc)
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('scan-hit')).toContainText(onShelf2.description, { ignoreCase: true })
  await expect(page.getByTestId('scan-where')).toContainText('Shelf 2')
  await page.getByTestId('scan-show').click()
  await expect(page.getByTestId('focus-name')).toHaveText('Shelf 2')
  await expect(openRow(page).locator('.row-name')).toHaveText(/Ketchup/)
})

test('drag a product to another shelf', async ({ page }, info) => {
  await loadData(page)
  const top = await shelfNames(page, 5)
  const four = await shelfNames(page, 4)
  const from = await center(rows(page).nth(0).getByTestId('tile').nth(2))
  const target = await rows(page).nth(1).locator('.shelf-canvas').boundingBox()
  await drag(page, info, from, { x: target.x + target.width - 10, y: target.y + target.height / 2 })
  await expect.poll(() => shelfNames(page, 4)).toHaveLength(four.length + 1)
  expect((await shelfNames(page, 4)).at(-1)).toBe(top[2])
  expect(await shelfNames(page, 5)).toHaveLength(top.length - 1)
})

test('phone: the whole set fits on the screen without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only')
  await loadData(page)
  await expect.poll(() => page.getByTestId('d-window').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  const hint = await page.getByTestId('whole-hint').boundingBox()
  const scan = await page.locator('.scan-bubble').boundingBox()
  const text = await page.getByTestId('whole-hint').evaluate((el) => { // where the words are, not the padding around them
    const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { bottom: b.bottom }
  })
  expect(hint.y).toBeGreaterThan(0)
  expect(text.bottom).toBeLessThanOrEqual(scan.y) // the hint is not hidden behind the Scan button
})
