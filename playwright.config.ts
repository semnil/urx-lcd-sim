import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the built page in a real Chromium, driven by real pointer
// and key events, for what jsdom cannot show — which element a touch lands on,
// the order a press moves the focus in, and when the browser runs the work a
// handler queues. `pnpm test` stays the gate for everything else.

/** A Chromium already on the machine, used in place of the one Playwright downloads. */
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
const PORT = 5189;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
  webServer: {
    command: `pnpm exec vite build --logLevel warn && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
