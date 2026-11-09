// Barcode scanner with no camera at all (a phone that refuses the camera, or a computer without one):
// read a photo of a barcode, or type its numbers. Kept apart from scanner.spec.js, whose fake camera would
// otherwise start here and read its own barcode in the middle of this test.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CATALOG = path.resolve('../data/build/catalog.json')
test.skip(!fs.existsSync(CATALOG), 'store data not built')
async function loadData(page) {
  await page.goto('./')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('status-pill')).toBeVisible()
}

const BARCODES = path.resolve('../data/build/test-barcodes')
const ON_PLAN = '041500000527'
const NOT_ON_PLAN = '030772093863' // a Tide product in the store data, not in this plan
if (!fs.existsSync(path.join(BARCODES, `${NOT_ON_PLAN}-photo.jpg`))) {
  execFileSync('node', ['e2e/make-test-barcodes.mjs', BARCODES, ON_PLAN, NOT_ON_PLAN])
}

test('scanner without a camera: read a photo of a barcode, or type the numbers, and add', async ({ page }) => {
  await loadData(page)
  await page.getByTestId('open-add').click()
  await page.getByTestId('open-scan').click()
  await page.getByTestId('scan-photo').setInputFiles(path.join(BARCODES, `${NOT_ON_PLAN}-photo.jpg`))
  await expect(page.getByTestId('scan-hit')).toContainText('TIDE', { timeout: 15000 })
  await expect(page.getByTestId('scan-where')).toContainText('Not in this plan')
  await page.getByTestId('scan-add').click()
  await expect(page.locator('.frow.open')).toContainText('TIDE', { ignoreCase: true })
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
  await expect(page.getByTestId('tray')).toContainText('GREY POUPON MUSTARD COUNTRY', { ignoreCase: true })
})
