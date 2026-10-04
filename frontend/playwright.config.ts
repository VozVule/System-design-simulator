import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0, workers: 4,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node e2e/start-app.mjs', url: 'http://127.0.0.1:5173', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 } },
});
