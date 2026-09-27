import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.CLONE_SDK_TEST_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid CLONE_SDK_TEST_PORT');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, retries: 0,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: `node node_modules/vite/bin/vite.js --config examples/react/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false },
});
