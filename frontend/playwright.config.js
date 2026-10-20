import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  globalTeardown: "../backend/test/frontend-teardown.js",
  webServer: [
    {
      command: "node ../backend/test/frontend-server.js",
      url: "http://127.0.0.1:4005/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run build && npm run preview -- --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      env: { API_PROXY_TARGET: "http://127.0.0.1:4005" },
      reuseExistingServer: false,
    },
  ],
});

