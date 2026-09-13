# Plan: auth_approval

File: `docs/plans/plan_auth_approval_2026-09-13.md`. Status: planned. Sequence: 2c. Depends on: `plan_vercel_deploy_2026-09-13.md`. Files owned: `frontend/src/app/(auth)/` (new), `frontend/src/app/admin/` (new), auth server/client helpers, auth API/actions, Supabase migration/seed instructions, auth tests, auth deployment documentation. Do not modify engine files or the IndexedDB schema in this plan.

## Goal

Add real email/password accounts to the public Magic Ball app. New users must be approved before using the app, except for one pre-approved email. Fvnguyen must be an administrator, with an admin screen for approving or rejecting pending accounts. Login and sign-up should use the visual language of the start page while keeping the existing browser-local game saves intact.

## Decisions (locked)

1. Use Supabase Auth email/password for identity and sessions, with secure HTTP-only session handling through the official Next.js server integration. Do not copy TG-Training's custom PIN/session implementation.
2. Add a `profiles` table keyed to `auth.users.id` with normalized email, display name, `status` (`PENDING`, `APPROVED`, `REJECTED`), and `role` (`USER`, `ADMIN`). Enable RLS with no client write access; server actions use a server-only Supabase service-role client only after checking the current session and role.
3. Sign-up creates an Auth user and profile. `nguyen.teomads@gmail.com` is the only automatic approval address. Every other new account is `PENDING` until an administrator approves it. Rejected users cannot access protected app routes.
4. Add `/login`, `/signup`, `/pending`, and `/admin/users`. Protected gameplay and roster routes redirect unauthenticated users to `/login`; pending users go to `/pending`; only admins can open `/admin/users` or mutate approval status.
5. Pre-register `Fvnguyen` as `nguyen.fabian@gmail.com` with role `ADMIN` through a one-time operator-run Supabase Admin API command. The password is supplied interactively or through an untracked local environment variable and is never committed, logged, or placed in a migration. The password quoted in the request is considered compromised and must be replaced before production use.
6. Required deployment variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is server-only and is added to Vercel and local `.env.local`, never to GitHub source or browser code.
7. This plan adds account gating and approval only. Cloud-synced drafts, rosters, and seasons remain out of scope; existing IndexedDB data remains local to the browser.

## Out of scope

- Cloud saves or migration of existing IndexedDB data; this belongs in `accounts_cloud_saves` after auth is complete.
- OAuth providers, passwordless email, MFA, billing, teams, multiplayer, and email notification delivery.
- Copying credentials, Supabase keys, or the existing TG-Training database into this repository.

## Tasks

1. **Write the auth data contract.** Files: new Supabase migration and setup documentation. Done when the profiles table, enum/check constraints, trigger or server creation path, RLS deny rules, and pre-approved email rule are reviewable without secrets. Tier: top.
2. **Implement server auth/session helpers.** Files: auth clients, middleware/proxy, server actions/API routes, protected route policy. Done when unauthenticated, pending, rejected, approved, and admin requests have tested outcomes. Tier: top.
3. **Build auth and approval UI.** Files: `/login`, `/signup`, `/pending`, `/admin/users`, shared auth styling/components. Done when the pages are responsive, visually consistent with the start page, and approval/rejection refreshes the admin list. Tier: mid.
4. **Add tests and operator setup.** Files: unit/route tests, setup docs, `.env.example`, package dependencies/scripts if required. Done when the admin bootstrap command is documented without a password, test coverage includes the allowlist and role gates, and no secret appears in Git. Tier: mid.
5. **Deploy and verify.** Files: deployment docs and Vercel environment settings. Done when the three variables exist in Vercel, admin login works, the allowlisted email is approved automatically, an ordinary signup is pending, and a pending user cannot open `/draft`. Tier: top.

## Parallelization

Wave 0: the driver locks the profile schema, route policy, and Supabase environment contract. Tier top.

Wave 1: the migration/setup documentation and auth UI can proceed in parallel after the contract is fixed. The server auth helper remains the dependency for route wiring. Tier mid.

Wave 2: the driver integrates protected routes, runs tests, creates the admin account, configures Vercel variables, and performs the production verification. Tier top.

## Recommended model tier

Main driver: top tier Anthropic / Google for authentication, RLS, and deployment security. UI and test implementation: mid tier after the data contract is locked.

## Verification / exit criteria

- `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.
- No password, service-role key, or access token appears in tracked files, build output, or workflow logs.
- `/login`, `/signup`, and `/pending` render on desktop and mobile without console errors.
- The admin account is created with `role=ADMIN` and `status=APPROVED`.
- `nguyen.teomads@gmail.com` is automatically approved; another valid email is `PENDING`.
- Pending and rejected users cannot access protected gameplay or roster routes; approved users can.
- Only an approved admin can approve or reject users.
- Vercel production has the required variables configured with the service-role key hidden, and the deployed auth flow passes a smoke test.