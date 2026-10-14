import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from https://cjwilcox95-jpg.github.io/shelf-planner/
export default defineConfig({
  base: '/shelf-planner/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.js'],
  },
})
