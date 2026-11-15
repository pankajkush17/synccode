import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests drive real browsers against the real stack. Start it first:
 *
 *   pnpm dev          # sync node on :4000 + web on :3000 (needs Postgres and Redis)
 *   pnpm test:e2e
 *
 * Point at another deployment with E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
