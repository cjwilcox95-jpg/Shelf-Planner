// Draws the home-screen icons from public/logo.svg (run after changing the logo):  node scripts/make-icons.mjs
// - icon-192.png, icon-512.png: the logo as it is (rounded corners)
// - apple-touch-icon.png (180): full square, iPhones round the corners themselves
// - icon-maskable-512.png: full square with the picture shrunk into the middle, so Android's round or
//   squircle cut never clips it
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public')
const svg = fs.readFileSync(path.join(PUB, 'logo.svg'), 'utf8')
const square = svg.replace('rx="22"', 'rx="0"')
const maskable = square.replace(/<g id="art" transform="([^"]*)">/, '<g id="art" transform="translate(50 50) scale(0.74) translate(-50 -50) $1">')

const browser = await chromium.launch()
const page = await browser.newPage()
async function draw(markup, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: path.join(PUB, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  console.log(`${file} (${size}px)`)
}
await draw(svg, 192, 'icon-192.png')
await draw(svg, 512, 'icon-512.png')
await draw(square, 180, 'apple-touch-icon.png')
await draw(maskable, 512, 'icon-maskable-512.png')
await browser.close()
