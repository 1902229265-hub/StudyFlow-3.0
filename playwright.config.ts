import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "acceptance.spec.ts",
    "faults.spec.ts",
    "hardening.spec.ts",
    "review-regressions.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: "http://127.0.0.1:5183",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
  },
  outputDir: "evidence/test-artifacts",
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/acceptance-results.json" }],
  ],
});
