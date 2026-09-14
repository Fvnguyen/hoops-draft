# Plan: playwright_auth_fixture

File: `docs/plans/plan_playwright_auth_fixture_2026-09-14.md`. Status: done 2026-09-14.
Sequence: 1c in `docs/ROADMAP.md`. Depends on: `auth_approval` (done). Files owned:
`frontend/scripts/bootstrap-e2e-user.mjs` (new), `frontend/tests/auth.setup.ts` (new),
`frontend/playwright.config.ts`, `frontend/package.json`, `frontend/.env.example`,
`.gitignore`, `frontend/supabase/README.md`.

## Goal

`npm run test:e2e` (`tests/smoke.spec.ts`, `home.spec.ts`, `visual.spec.ts`) has been
unable to pass since `auth_approval` landed: every protected route 401s for Playwright's
unauthenticated browser context, so `smoke.spec.ts`'s "no console errors" assertion always
fails. This plan gives the Playwright suite a real, approved logged-in session so those
specs test the actual app instead of a login redirect.

## Decisions (locked)

- D1 Dedicated test account, not the real admin. Email
  `nguyen.fabian+e2e@gmail.com` (plus-addressing on the owner's real address — passes
  Supabase's email format validation, needs no inbox since `email_confirm: true` skips
  verification, and is visibly distinct from the human admin account in `/admin/users`).
  `role: 'USER'`, `status: 'APPROVED'`, `username: 'e2e_test'`, `display_name: 'E2E Test'`.
- D2 Password lives in a new `E2E_TEST_PASSWORD` env var in `frontend/.env.local`
  (gitignored already via the existing `.env*` rule) with a placeholder in
  `frontend/.env.example`. `E2E_TEST_EMAIL` is also an env var (not hardcoded in the spec
  files) so a different test account can be swapped in later without touching test code.
- D3 `frontend/scripts/bootstrap-e2e-user.mjs`, modeled directly on the existing
  `scripts/bootstrap-admin.mjs` (same create-or-find-then-upsert-profile shape, same
  `email_exists` error handling), reads `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` instead of a
  hardcoded email. New `package.json` script: `"bootstrap:e2e": "node scripts/bootstrap-e2e-user.mjs"`.
- D4 Auth fixture uses Playwright's standard setup-project pattern, not a raw API call:
  `frontend/tests/auth.setup.ts` navigates to `/login`, fills the identifier/password
  fields, submits, waits for the post-login redirect (away from `/login`), then calls
  `page.context().storageState({ path: 'tests/.auth/user.json' })`. Going through the real
  form (not `POST /api/auth/login` via `request.post`) means the browser context gets
  Supabase's cookies exactly as a real user would, with no manual cookie-attribute
  plumbing.
- D5 `playwright.config.ts` gets a `setup` project (`testMatch: /.*\.setup\.ts/`) that
  runs first; the existing `chromium` project adds `dependencies: ['setup']` and
  `use: { storageState: 'tests/.auth/user.json' }`. `frontend/tests/.auth/` is added to
  the root `.gitignore` (live session cookies, never committed).
- D6 Scope is local-only. Per `AGENTS.md`, Playwright is not run in CI (win32 snapshots,
  needs a server) — `test:e2e`/smoke stays a local gate. This plan does not add any CI
  secret or workflow step.

## Out of scope

Running Playwright in CI at all (a separate, bigger decision: headless Linux snapshots
would diverge from the committed win32 ones in `visual.spec.ts`). Mocking Supabase instead
of hitting the real project (rejected: `auth_approval`'s own gap note asked for a login
fixture, not a mock, and a real session also exercises the real RLS policies).

## Tasks

- T1 (low): Write `frontend/scripts/bootstrap-e2e-user.mjs` and the `bootstrap:e2e` script
  entry. Done-when: `npm run bootstrap:e2e` (with `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` set)
  prints "ready" and the account shows APPROVED in `/admin/users`.
- T2 (low): Write `frontend/tests/auth.setup.ts`. Done-when: running it alone
  (`npx playwright test auth.setup.ts`) writes `tests/.auth/user.json` with a non-empty
  cookie array.
- T3 (low): Wire `playwright.config.ts` (setup project + `dependencies` + `storageState`),
  update `.env.example`, add `tests/.auth/` to `.gitignore`, add the one-time setup step to
  `frontend/supabase/README.md`. Done-when: `npm run test:e2e` runs `smoke.spec.ts` against
  an authenticated session (see exit criteria).

## Parallelization

Single small plan, no parallel waves — T1 then T2 (T2 needs the account T1 creates) then
T3.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro (mid) — mechanical, but touches auth and test config
where a mistake silently no-ops rather than erroring. No lower-tier wave; not worth
splitting further.

## Verification / exit criteria

1. **Done.** `npm run bootstrap:e2e` succeeds: "E2E test account ready for
   nguyen.fabian+e2e@gmail.com."; APPROVED confirmed via the login round trip below.
2. **Done.** `npm run test:e2e`: `smoke.spec.ts`'s 8 route checks pass with zero
   console/page errors (previously 401 on every protected route).
3. **Done, with one fix and two flagged.** `home.spec.ts` 2/2 pass. `visual.spec.ts`: 1
   failure (DeckBuilder Top KPI Band) traced to `ui_polish_small_fixes`'s T4 radar resize
   and re-baselined; 2 failures (Franchise Dashboard, Game View Matchup) have no
   attributable cause in any change this session or last — left as-is per owner call, filed
   as `docs/HANDOVER.md` open issue 8.
4. **Done.** `git status` shows no `.auth/` files or secrets staged; `tests/.auth/` is
   gitignored (root `.gitignore`).
