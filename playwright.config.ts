import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const vercelOidcToken = process.env.VERCEL_GITHUB_OIDC_TOKEN;

if (!baseURL) {
  throw new Error("PLAYWRIGHT_BASE_URL must identify the exact deployed preview under review.");
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".artifacts/playwright/test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  updateSnapshots: "none",
  workers: 1,
  reporter: [
    ["line"],
    ["html", { outputFolder: ".artifacts/playwright/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "light",
    extraHTTPHeaders: vercelOidcToken
      ? { "x-vercel-trusted-oidc-idp-token": vercelOidcToken }
      : undefined,
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: "review", testMatch: "**/*.review.spec.ts", use: { browserName: "chromium" } },
    { name: "smoke", testMatch: "**/*.smoke.spec.ts", use: { browserName: "chromium" } },
    { name: "consistency", testMatch: "**/*.consistency.spec.ts", use: { browserName: "chromium", video: "off" } },
  ],
});
