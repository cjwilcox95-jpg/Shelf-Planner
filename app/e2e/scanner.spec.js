// Barcode scanner checks. A fake camera (Chrome's test camera) shows a real UPC-A barcode made by
// zxing-wasm's writer, slightly blurred and grainy, so the same decoding the phone uses is exercised.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CATALOG = path.resolve('../data/build/catalog.json')
const SHOTS = path.resolve('../data/build/screenshots')
test.skip(!fs.existsSync(CATALOG), 'store data not built')
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${test.info().project.name}-${name}.png`) })
const rows = (page) => page.getByTestId('shelf-row')
async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('status-pill')).toBeVisible()
}

// ---------- barcode scanner (a fake camera shows a real UPC-A barcode) ----------
const BARCODES = path.resolve('../data/build/test-barcodes')
const ON_PLAN = '041500000527' // French's honey mustard, top shelf #1 of the Ketchup-Mustard set
const NOT_ON_PLAN = '030772093863' // a Tide product in the store data, not in this plan
if (!fs.existsSync(path.join(BARCODES, `${ON_PLAN}.y4m`)) || !fs.existsSync(path.join(BARCODES, `${NOT_ON_PLAN}-photo.jpg`))) {
  execFileSync('node', ['e2e/make-test-barcodes.mjs', BARCODES, ON_PLAN, NOT_ON_PLAN])
}

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(BARCODES, `${ON_PLAN}.y4m`)}`] },
  permissions: ['camera'],
})

test.describe('scanner with a camera', () => {
  test('scan a product on the plan with the camera, then show it on the shelf', async ({ page }) => {
    await loadData(page)
    await page.getByTestId('open-add').click()
    await page.getByTestId('open-scan').click()
    await expect(page.getByTestId('scan-hit')).toContainText('FRENCHS MUSTARD SQUEEZE HONEY', { timeout: 15000 })
    await expect(page.getByTestId('scan-where')).toContainText('Shelf 7 (top), #1')
    await shot(page, '26-scan-found')
    await page.getByTestId('scan-show').click()
    await expect(page.getByTestId('focus-name')).toHaveText('Shelf 7 (top)') // zoomed in to its shelf
    await expect(page.locator('.frow.open')).toContainText('FRENCHS MUSTARD SQUEEZE HONEY')
  })

  test('measure as you go: scan, type tape sizes with fractions, saved as measured', async ({ page }) => {
    await loadData(page)
    await page.getByTestId('open-tools').click()
    await page.getByTestId('tool-measure').click()
    await expect(page.getByTestId('tape-w')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('tape-w').fill('2')
    await page.getByRole('button', { name: '3/4', exact: true }).click()
    await expect(page.getByTestId('tape-w')).toHaveValue('2 3/4')
    await page.getByTestId('tape-h').fill('8 1/2')
    await expect(page.getByText('= 8.5')).toBeVisible()
    await shot(page, '27-measure')
    await page.getByTestId('tape-save').click()
    await expect(page.getByTestId('measured-count')).toHaveText('1 measured')
    await page.getByRole('button', { name: 'Done' }).click()
    // the product now shows measured sizes (no ~ or ≈ mark) everywhere
    await rows(page).nth(0).getByTestId('tile').nth(0).click()
    await page.locator('.frow.open').getByTestId('details').click()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByTestId('selected-panel')).toContainText('2.75 W × 8.5 H')
    await expect(page.getByTestId('selected-panel')).toContainText('W measured · H measured')
  })
})

test('scanner without a camera: read a photo of a barcode, or type the numbers, and add', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('open-add').click()
  await page.getByTestId('open-scan').click()
  await page.getByTestId('scan-photo').setInputFiles(path.join(BARCODES, `${NOT_ON_PLAN}-photo.jpg`))
  await expect(page.getByTestId('scan-hit')).toContainText('TIDE', { timeout: 15000 })
  await expect(page.getByTestId('scan-where')).toContainText('Not in this plan')
  await page.getByTestId('scan-add').click()
  await expect(page.locator('.frow.open')).toContainText('TIDE')
  // typed: the 10 digits printed under a barcode, without the first 0 and the check digit
  await page.getByTestId('open-add').click()
  await page.getByTestId('open-scan').click()
  await page.getByTestId('scan-typed').fill('4150000052')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('scan-hit')).toContainText('FRENCHS MUSTARD SQUEEZE HONEY')
  // a product of this plan that is off the shelf: says so, and opens that list (no second copy added)
  await page.getByTestId('scan-next').click()
  await page.getByTestId('scan-typed').fill('5440000040') // Grey Poupon Country, left off the set by AFI
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('scan-where')).toContainText('off the shelf')
  await page.getByTestId('scan-tray').click()
  await expect(page.getByTestId('tray')).toContainText('GREY POUPON MUSTARD COUNTRY')
})
