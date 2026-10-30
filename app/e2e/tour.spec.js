// A tour of every screen: takes a screenshot of each and checks the design rules from the brief
// (nothing wider than the screen, text at least 14 px, buttons at least 44 px tall).
// Problems are written to data/build/screenshots/<project>-tour-problems.txt and must be empty.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const CATALOG = path.resolve('../data/build/catalog.json')
const AISLE = path.resolve('../data/build/aisle/aisle-plans-backup.json')
const MOVEMENT = path.resolve('../data/build/movement.json')
const SHOTS = path.resolve('../data/build/screenshots/tour')
fs.mkdirSync(SHOTS, { recursive: true })
test.skip(!fs.existsSync(CATALOG), 'store data not built')

/** Rule checks on what is visible right now. */
async function audit(page) {
  return page.evaluate(() => {
    const out = []
    const vw = innerWidth
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide (screen ${vw})`)
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return false
      const s = getComputedStyle(el)
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
    }
    const root = document.querySelector('[role=dialog]') || document.body // with a panel open, only the panel counts
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    // text size (the shelf drawing is a to-scale picture; its tiles are allowed to shrink when zoomed out)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const small = new Set()
    while (walker.nextNode()) {
      const t = walker.currentNode
      if (!t.textContent.trim()) continue
      const el = t.parentElement
      if (!el || !visible(el) || el.closest('.shelf-canvas, .ruler, svg, .print-preview')) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 14) small.add(`text ${fs}px: "${label(el)}"`)
    }
    out.push(...small)
    for (const el of root.querySelectorAll('button, [role=button]:not(.tile), label.btn, a, input:not([type=file]), select')) {
      if (!visible(el) || el.closest('.shelf-canvas')) continue
      const r = el.getBoundingClientRect()
      if (r.height < 43.5 && !el.matches('input[type=checkbox]')) out.push(`touch target ${Math.round(r.width)}x${Math.round(r.height)}: "${label(el)}"`)
      if (r.right > vw + 1) out.push(`off the right edge: "${label(el)}"`)
    }
    return out
  })
}

test('tour of every screen', async ({ page }, info) => {
  test.setTimeout(180_000)
  const problems = []
  let n = 0
  const snap = async (name) => {
    await page.waitForTimeout(250)
    n++
    const file = `${info.project.name}-${String(n).padStart(2, '0')}-${name}.png`
    await page.screenshot({ path: path.join(SHOTS, file) })
    for (const p of await audit(page)) problems.push(`${name}: ${p}`)
  }
  const sheet = async (open, name) => { await open(); await expect(page.getByRole('dialog')).toBeVisible(); await snap(name); await page.getByRole('button', { name: 'Done' }).click() }

  await page.goto('./')
  await snap('first-run')
  await page.getByTestId('data-file').setInputFiles(CATALOG)
  await expect(page.getByTestId('status-pill')).toBeVisible()
  await snap('whole-set')
  await sheet(() => page.getByTestId('status-pill').click(), 'status')
  const tile = page.getByTestId('shelf-row').nth(1).getByTestId('tile').nth(1)
  await tile.click()
  await expect(page.locator('.frow.open')).toBeVisible()
  await snap('one-shelf-selected')
  await page.locator('.frow.open').getByTestId('details').click()
  await snap('details')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await snap('details-more')
  await sheet(() => page.getByTestId('edit-size').click(), 'edit-size')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await snap('move-mode')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await sheet(() => page.getByTestId('open-add').click(), 'add-empty')
  await page.getByTestId('open-add').click()
  await page.getByTestId('search-input').fill('ketchup 20')
  await snap('add-results')
  await page.getByRole('button', { name: 'Done' }).click()
  await sheet(() => page.getByTestId('open-shelf').click(), 'shelf')
  await sheet(() => page.getByTestId('open-tray').click(), 'off-the-shelf')
  await sheet(() => page.getByRole('button', { name: 'Plans', exact: true }).click(), 'plans')
  await sheet(() => page.getByTestId('open-tools').click(), 'tools')
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-guesses').click()
  await snap('guesses')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-print').click()
  await page.getByTestId('make-pdf').click()
  await expect(page.getByTestId('print-ready')).toBeVisible()
  await snap('print')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('open-tools').click()
  await page.getByTestId('tool-compare').click()
  await snap('compare-none')
  await page.getByRole('button', { name: 'Done' }).click()
  if (fs.existsSync(MOVEMENT)) {
    await page.getByTestId('open-tools').click()
    await page.getByTestId('tool-sales').click()
    await snap('sales-empty')
    await page.getByTestId('movement-file').setInputFiles(MOVEMENT)
    await expect(page.getByTestId('movement-period')).toBeVisible()
    await snap('sales')
    await page.getByRole('button', { name: 'Done' }).click()
  }
  await page.getByTestId('shelf-down').click()
  await snap('next-shelf-down')
  await page.getByTestId('shelf-rows').getByTestId('frow').last().scrollIntoViewIfNeeded()
  await snap('list-bottom')
  await page.getByTestId('minimap').click()
  await snap('back-to-whole-set')
  if (fs.existsSync(AISLE)) {
    await page.getByRole('button', { name: 'Plans', exact: true }).click()
    await page.getByTestId('import-file').setInputFiles(AISLE)
    await page.getByTestId('plan-list').locator('li').filter({ hasText: 'Laundry C' }).getByRole('button', { name: 'Open', exact: true }).click()
    await snap('laundry-c')
    await page.getByRole('button', { name: 'Plans', exact: true }).click()
    await page.getByTestId('aisle-list').locator('li').filter({ hasText: 'Laundry aisle' }).getByTestId('open-aisle').click()
    await snap('aisle')
    await page.getByRole('button', { name: 'Plans', exact: true }).click()
    await snap('plans-with-aisle')
    await page.getByRole('button', { name: 'Done' }).click()
  }
  fs.writeFileSync(path.join(SHOTS, `${info.project.name}-tour-problems.txt`), problems.join('\n') + '\n')
  expect(problems, problems.join('\n')).toEqual([])
})
