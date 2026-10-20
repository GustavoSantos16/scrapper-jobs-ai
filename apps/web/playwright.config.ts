import { defineConfig, devices } from '@playwright/test';

const port = 4399;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // a fresh temp database per run; connectors read recorded fixtures (no network)
    command: `pnpm build && pnpm --filter @ajh/api exec tsx test/e2e-server.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    env: { E2E_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
