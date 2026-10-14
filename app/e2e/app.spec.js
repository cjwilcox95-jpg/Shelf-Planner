// End-to-end checks in a real browser. They use the store-data file built by
// scripts/build_catalog.py (data/build/catalog.json), which never leaves this machine.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const CATALOG = path.resolve('../data/build/catalog.json')
const SHOTS = path.resolve('../data/build/screenshots')
fs.mkdirSync(SHOTS, { recursive: true })
test.skip(!fs.existsSync(CATALOG), 'store data not built')

const names = (page) => page.locator('[data-testid=item-list] .row-name').allInnerTexts()
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-${name}.png`), fullPage: false })

async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('summary')).toBeVisible()
}

/** A real finger: press, hold, slide, lift (Chrome DevTools touch events). */
async function fingerDrag(page, from, to, { hold = 650, steps = 14 } = {}) {
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

const center = async (loc) => {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('first run: load store data, demo shelf appears', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('Load your store data')).toBeVisible()
  await shot(page, '01-import')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.locator('.title')).toContainText('Ketchup')
  expect((await names(page)).length).toBe(7)
  await shot(page, '02-demo-shelf')
  await page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-02b-demo-full.png`), fullPage: true })
})

test('drag a product to a new spot', async ({ page }, info) => {
  await loadData(page)
  const before = await names(page)
  const tiles = page.getByTestId('tile')
  const first = await center(tiles.nth(0))
  const fourth = await tiles.nth(3).boundingBox()
  const target = { x: fourth.x + fourth.width * 0.8, y: first.y }
  if (info.project.name === 'phone') {
    await fingerDrag(page, first, target)
  } else {
    await page.mouse.move(first.x, first.y)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 12 })
    await page.mouse.up()
  }
  const after = await names(page)
  expect(after[3]).toBe(before[0]) // first item now 4th
  expect(after.slice(0, 3)).toEqual(before.slice(1, 4))
  await expect(page.getByRole('status')).toContainText('Moved')
  await shot(page, '03-after-drag')
})

test('a quick swipe scrolls the shelf instead of dragging', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only')
  await loadData(page)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  const before = await names(page)
  const scroller = page.getByTestId('shelf-scroll')
  const startLeft = await scroller.evaluate((el) => el.scrollLeft)
  const t = await center(page.getByTestId('tile').nth(1))
  await fingerDrag(page, { x: 300, y: t.y }, { x: 60, y: t.y }, { hold: 30, steps: 8 })
  await page.waitForTimeout(400)
  expect(await names(page)).toEqual(before) // nothing moved
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(startLeft)
})

test('tap to select, then tap to place', async ({ page }) => {
  await loadData(page)
  const before = await names(page)
  await page.getByTestId('tile').nth(0).tap?.().catch(() => {})
  if (!(await page.getByTestId('selected-panel').isVisible())) await page.getByTestId('tile').nth(0).click()
  await expect(page.getByTestId('selected-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByText('Tap the shelf where it should go.')).toBeVisible()
  const last = await page.getByTestId('tile').nth(6).boundingBox()
  await page.mouse.click(last.x + last.width - 2, last.y + last.height / 2)
  const after = await names(page)
  expect(after[6]).toBe(before[0])
  await shot(page, '04-tap-to-place')
})

test('facings, over-capacity warning, undo/redo, and it survives a reload', async ({ page }) => {
  await loadData(page)
  const left = page.getByTestId('left-or-over')
  await page.getByTestId('tile').nth(0).click()
  const facings = page.getByTestId('facings')
  const start = Number(await facings.innerText())
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'One more facing' }).click()
  await expect(facings).toHaveText(String(start + 6))
  await expect(left).toContainText('OVER') // shelf turns red but nothing is blocked
  await expect(page.getByTestId('summary')).toHaveClass(/over/)
  await shot(page, '05-over')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(facings).toHaveText(String(start + 5))
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(facings).toHaveText(String(start + 6))
  await page.reload()
  await expect(page.getByTestId('summary')).toBeVisible()
  await expect(left).toContainText('OVER')
})

test('search by name and by UPC, then add', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('open-add').click()
  const input = page.getByTestId('search-input')
  await input.fill('frenchs mustard')
  await expect(page.getByTestId('add-result').first()).toBeVisible()
  await shot(page, '06-search')
  await input.fill('0-41500-00031') // French's 20 oz, written the AFI way
  await expect(page.locator('.results .row-name').first()).toContainText('FRENCHS')
  await page.getByTestId('add-result').first().click()
  expect((await names(page)).length).toBe(8)
  await expect(page.getByTestId('selected-panel')).toContainText('FRENCHS')
})

test('start from an AFI reset shelf, and change shelf size', async ({ page }) => {
  await loadData(page)
  await page.getByRole('button', { name: 'AFI sets' }).click()
  await page.getByText('Pickles - Relish').click()
  await shot(page, '07-afi-picker')
  await page.locator('[data-testid$="shelf-7"]').first().click()
  await expect(page.locator('.title')).toContainText('Pickles')
  expect((await names(page)).length).toBe(17)
  await expect(page.locator('.title-btn .muted')).toContainText('96 W')
  await page.getByRole('button', { name: 'Shelf size' }).click()
  await page.getByRole('button', { name: '48', exact: true }).click()
  await page.getByRole('button', { name: 'Save shelf size' }).click()
  await expect(page.getByTestId('left-or-over')).toContainText('OVER')
  await shot(page, '08-pickles-on-4ft')
})
