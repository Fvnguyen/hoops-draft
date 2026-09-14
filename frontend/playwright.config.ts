import { defineConfig, devices } from '@playwright/test';

// Standalone Node process — unlike `next dev`/`next build`, nothing loads .env.local for
// us. Guarded because this file is also read in environments without one (CI doesn't run
// Playwright at all per AGENTS.md, but the import must not throw there regardless).
try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local present — fine outside local dev
}

export default defineConfig({
  testDir: './tests',
  // Playwright specs (*.spec.ts) plus the auth setup project (*.setup.ts); tests/unit and
  // tests/storage are Vitest (*.test.ts).
  testMatch: /.*\.(spec|setup)\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
    },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
