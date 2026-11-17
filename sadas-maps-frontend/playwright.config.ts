import { defineConfig, devices } from '@playwright/test';

/**
 * Test end-to-end della pagina di prova, con il back-end simulato nel browser (?backend=simulato).
 * Avviano `ng serve` sulla porta 4300 (o riusano un server già avviato lì).
 *
 *   npm run e2e         solo Chromium
 *   npm run e2e:all     anche Firefox e WebKit (prima: npx playwright install firefox webkit)
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:4300',
    viewport: { width: 1300, height: 800 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start -- --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1300, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1300, height: 800 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1300, height: 800 } } },
  ],
});
