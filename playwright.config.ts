import { defineConfig, devices } from '@playwright/test'

// Runs against a server that is already up: `npm run preview` locally (mock models),
// or E2E_BASE_URL=<your deployed URL> for a deployed copy.
// E2E_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's own browser download.
// E2E_DEVICE='iPhone 15' plays the suite as that phone: WebKit, touch and its screen size.
const device = process.env.E2E_DEVICE ? devices[process.env.E2E_DEVICE] : undefined

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8788',
    ...(device ?? { viewport: { width: 1440, height: 900 } }),
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
})
