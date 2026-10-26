import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4175/recipe-art-catalog/",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/serve.mjs --dist",
    env: { PORT: "4175", BASE_PATH: "/recipe-art-catalog/" },
    url: "http://127.0.0.1:4175/recipe-art-catalog/",
    reuseExistingServer: !process.env.CI,
  },
});
