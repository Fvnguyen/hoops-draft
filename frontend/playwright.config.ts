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
      // Desktop 1280x800 stays the primary snapshot baseline (plan_mobile_responsive D1).
      // mobile-audit is a measuring harness for the two touch viewports, not a desktop
      // gate, so it is excluded here.
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /mobile-audit\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
    // plan_mobile_responsive D1: the owner's real devices, in landscape, as CSS px.
    // `isMobile` + `hasTouch` make Chromium report a touch/coarse pointer so the app's
    // touch branches and `(pointer: coarse)` media queries are the ones under test.
    // T1 scopes these projects to the audit spec; T6/D9 widens them to smoke + visual
    // once the punch-list fixes land and the mobile snapshots are committed.
    {
      name: 'phone-landscape',
      testMatch: /mobile-audit\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // S24+/S26+ landscape. 385 px is the usable height under browser chrome
        // (~300-340 px once the URL bar is showing), deliberately the harsh case.
        viewport: { width: 830, height: 385 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'tablet-landscape',
      testMatch: /mobile-audit\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // Galaxy Tab S10+ landscape.
        viewport: { width: 1244, height: 778 },
        deviceScaleFactor: 2.25,
        isMobile: true,
        hasTouch: true,
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
