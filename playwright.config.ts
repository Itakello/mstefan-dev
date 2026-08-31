import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

if (!baseURL) {
  throw new Error("PLAYWRIGHT_BASE_URL must identify the exact deployed preview under review.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.review.spec.ts",
  outputDir: ".artifacts/playwright/test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["line"],
    ["html", { outputFolder: ".artifacts/playwright/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "light",
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: "review", use: { browserName: "chromium" } }],
});
