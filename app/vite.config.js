import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from https://cjwilcox95-jpg.github.io/Shelf-Planner/ .
// Relative paths ('./') make it work whatever the folder is called (GitHub paths are case-sensitive).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.js'],
  },
})
