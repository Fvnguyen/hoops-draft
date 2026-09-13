# Plan: vercel_deploy

File: `docs/plans/plan_vercel_deploy_2026-09-13.md`. Status: planned. Sequence: 2b. Depends on: `plan_ui_draft_deckbuild_pack_2026-09-13.md`. Files owned: `vercel.json` (new, if required), root/frontend deployment docs, and any Vercel project configuration. Do not modify engine, storage, or draft UI files.

## Goal

Serve the current Magic Ball Next.js app from Vercel with a repeatable preview and production deployment path. The deployed app must serve cards and static assets correctly, preserve browser-local saves, keep the debug game-log endpoint unavailable in production, and document the expected monthly cost before launch.

## Decisions (locked)

1. Deploy the `frontend/` Next.js app from the repository root as a Vercel monorepo project. Vercel Root Directory is `frontend`; install, build, and output settings use the existing `frontend/package.json` and Next.js defaults.
2. Use Vercel Hobby for an initial personal, non-commercial deployment. Do not use Hobby for a commercial or team-facing product. Pro is the required commercial baseline at $20/month before tax, with usage billed against the included credit and then according to Vercel pricing.
3. Do not add a database, authentication, Vercel Blob, or external backend in this plan. Runtime game state remains in browser IndexedDB through `GameStore`; `src/data/cards.json` remains the shipped card artifact.
4. Treat `/api/cards` as a static read endpoint. Verify it returns the card pool in production with cache headers. Treat `/api/game-logs` as development-only; verify production returns 404 and do not promise server-side analytics persistence.
5. Use Git integration for preview deployments and production deployments from the protected production branch. Do not commit Vercel-generated `.vercel` output or secrets.
6. Cost estimate for the current scale: Hobby $0/month while eligible and within included limits; Pro $20/month base for commercial/team use. Hobby includes 1M edge requests, 100 GB fast data transfer, 1M function invocations, and 5K image transformations per month according to the pricing page fetched 2026-09-13. A custom domain is a separate registrar/TLD cost. No paid storage is expected.
7. Add spend protection before production: enable usage alerts and set the account/project hard budget according to the Vercel account controls available at setup. The plan must record the configured threshold in the handover.

## Out of scope

- Accounts, cloud saves, shared rosters, server persistence, or multiplayer backend. These belong to `accounts_cloud_saves` after `data_storage` and `mobile_pwa`.
- Replacing the file-backed debug export with hosted analytics storage. `/debug` remains a local/development tool.
- CDN/image redesign, domain purchase, SEO, or traffic marketing.
- Changes to gameplay, draft behavior, or UI styling except deployment-specific fixes proven by the deployment checks.

## Tasks

1. **Confirm deployment contract.** Files: `frontend/package.json`, `frontend/next.config.ts`, `frontend/src/app/api/cards/route.ts`, `frontend/src/app/api/game-logs/route.ts`, deployment docs. Done when `npm run build`, `npm test`, and `npm run lint` pass locally and the production endpoint behavior is documented. Tier: top.
2. **Configure Vercel project.** Files: `vercel.json` only if dashboard defaults cannot express the `frontend` root; deployment docs. Set Root Directory to `frontend`, framework to Next.js, Node version to the repository-supported version, and production branch to the chosen protected branch. Done when a preview deployment succeeds from Git and reports a successful Next build. Tier: mid.
3. **Verify production routes and assets.** Files: no application changes unless a deployment-specific defect is proven. Check `/`, `/draft`, `/rosters`, `/season`, `/api/cards`, `/pack-opener-preview`, a representative headshot, logo, and pack asset. Check `/api/game-logs` returns 404 in production. Done when a Playwright smoke run against the deployment has zero page errors and console errors, and the API assertions pass. Tier: mid.
4. **Document operations and cost.** Files: `README.md` or `frontend/README.md`, `docs/HANDOVER.md`. Record the Vercel project link, deployment branch, root directory, environment variables if any, spend alert threshold, and Hobby/Pro cost assumptions. Done when a new developer can redeploy from the documented commands and the cost estimate is visible. Tier: low.

## Parallelization

Wave 0: the driver confirms the build and route contract and chooses the Vercel production branch. Tier top.

Wave 1: deployment configuration and documentation can proceed in parallel because deployment configuration is dashboard/`vercel.json` scoped and documentation is README/HANDOVER scoped. Tier mid for configuration, low for documentation.

Wave 2: the driver runs the deployed smoke test, checks production API behavior, records cost and limits, and updates handover. Tier mid.

## Recommended model tier

Main driver: top tier Anthropic / Google for deployment decisions and production verification. Wave 1 configuration: mid tier. Documentation edits: low tier.

## Verification / exit criteria

- `npm run build` succeeds from the repository root using the configured Vercel root directory.
- `npm test` passes all current Vitest tests and `npm run lint` has zero errors.
- A Vercel preview deployment completes successfully from Git.
- Production `/api/cards` returns HTTP 200, a non-empty card array, and cache headers.
- Production `/api/game-logs` returns HTTP 404; no server-side save is advertised.
- Production smoke coverage loads `/`, `/draft`, `/rosters`, `/season`, and `/pack-opener-preview` with zero page errors and zero console errors.
- The first-pack opener displays its real generated pack and hands off to the draft route; browser-local roster/session saves still work.
- The documented cost is Hobby $0/month for eligible personal non-commercial use, or Pro $20/month base for commercial/team use, excluding taxes, domain registration, and any usage beyond included limits.
- Spend alerts or a hard budget are configured and recorded in `docs/HANDOVER.md`.
