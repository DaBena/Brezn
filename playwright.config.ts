import { URL } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/** Match `vite` base (see deploy workflow `BASE_PATH`). Local builds use `/`. */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/'

/**
 * `vite preview` reads `BASE_PATH` from the environment (see `vite.config.ts`).
 * CI sets `PLAYWRIGHT_BASE_URL` to .../RepoName/ but did not set `BASE_PATH` for
 * the preview process, so preview used `/` while `dist/` was built with
 * `/RepoName/` — assets 404 and the app never mounts.
 */
function basePathFromPlaywrightUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname
    if (!path || path === '/') return undefined
    return path.endsWith('/') ? path : `${path}/`
  } catch {
    return undefined
  }
}

const previewBasePath = process.env.BASE_PATH ?? basePathFromPlaywrightUrl(baseURL)

const webServerEnv = {
  ...process.env,
  ...(previewBasePath ? { BASE_PATH: previewBasePath } : {}),
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    env: webServerEnv,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
