// Makes barcode pictures (and a fake camera video) for the scanner tests, using zxing-wasm's own writer.
// Usage: node e2e/make-test-barcodes.mjs <outDir> <upc> [<upc>...]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeBarcode, prepareZXingModule } from 'zxing-wasm/writer'

const [outDir, ...upcs] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const wasm = fs.readFileSync(new URL('../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm', import.meta.url))
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } })
for (const upc of upcs) {
  const r = await writeBarcode(upc, { format: 'UPCA', scale: 4, addQuietZones: true, addHRT: true })
  if (r.error) throw new Error(r.error)
  const png = path.join(outDir, `${upc}.png`)
  fs.writeFileSync(png, Buffer.from(await r.image.arrayBuffer()))
  // a "camera" view: the label on a grey shelf, a little blurry and grainy, as a 1280x720 video
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-t', '2', '-r', '10',
    '-vf', 'scale=520:-1,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x8a8a84,gblur=sigma=0.7,noise=alls=6:allf=t,format=yuv420p',
    path.join(outDir, `${upc}.y4m`)])
  // the same view as a phone photo
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png,
    '-vf', 'scale=520:-1,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x8a8a84,gblur=sigma=0.7', '-frames:v', '1', path.join(outDir, `${upc}-photo.jpg`)])
}
console.log('made', upcs.join(' '))
