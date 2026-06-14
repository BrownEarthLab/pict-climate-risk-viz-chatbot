import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: [
    {
      command: "npm run dev",
      port: 5173,
      cwd: ".",
      reuseExistingServer: true,
    },
    {
      command: "node ../backend/server.js",
      port: 8000,
      cwd: ".",
      reuseExistingServer: true,
    },
  ],
});
