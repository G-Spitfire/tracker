import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './forma/tests',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8765',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: 'line',
});
