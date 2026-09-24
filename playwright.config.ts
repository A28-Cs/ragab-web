import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (§38). Runs the real Next.js app against the real backend + DB. The
 * webServer starts `next dev` (reusing an already-running one) with the local .env.
 * Tests live in ./e2e. Assumes Postgres/Redis/MinIO are up and the DB is seeded.
 *
 * Port: `E2E_PORT` (default 3000). The app's same-origin check reads
 * NEXT_PUBLIC_APP_URL, so the dev server is started with that variable pointed at the
 * same origin — otherwise every mutating request would be rejected as cross-origin.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'ar-EG',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx --prefix apps/web next dev -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_APP_URL: baseURL, PORT: String(port) },
  },
});
