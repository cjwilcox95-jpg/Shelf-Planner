import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  outputDir: '../data/build/test-results',
  // PW_CHROME: path of a Chrome to use when the downloaded one is missing (cloud sessions)
  use: { baseURL: 'http://localhost:4173/', launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {} },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } } },
  ],
})
