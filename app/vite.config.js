import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** Writes the list of built files (and a version) into dist/sw.js, so the app is saved for offline use on first open. */
function offlineList() {
  let dist = path.resolve('dist')
  return {
    name: 'offline-list',
    apply: 'build',
    configResolved(config) { dist = path.resolve(config.root, config.build.outDir) },
    closeBundle() {
      const files = []
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name)
          if (f.isDirectory()) walk(full)
          else if (!/^(sw\.js|\.nojekyll)$/.test(f.name)) files.push(path.relative(dist, full).split(path.sep).join('/'))
        }
      }
      walk(dist)
      files.sort()
      // the version comes from what is in the files, so changing an icon or the manifest also updates phones
      const hash = crypto.createHash('sha1')
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dist, f)))
      const version = hash.digest('hex').slice(0, 10)
      const swPath = path.join(dist, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf8')
        .replace("'dev' /* VERSION */", JSON.stringify(version))
        .replace('[] /* ASSETS */', JSON.stringify(files.map((f) => `./${f}`)))
      fs.writeFileSync(swPath, sw)
    },
  }
}

// The app is served from https://cjwilcox95-jpg.github.io/Shelf-Planner/ .
// Relative paths ('./') make it work whatever the folder is called (GitHub paths are case-sensitive).
export default defineConfig({
  base: './',
  plugins: [react(), offlineList()],
  test: {
    include: ['src/**/*.test.js'],
  },
})
