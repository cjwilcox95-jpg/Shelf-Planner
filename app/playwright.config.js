import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  outputDir: '../data/build/test-results',
  use: { baseURL: 'http://localhost:4173/shelf-planner/' },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/shelf-planner/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } } },
  ],
})
