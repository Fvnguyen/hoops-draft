# Plan: stability_pass

File: `docs/plans/plan_stability_pass_2026-09-13.md`. Status: planned.
Sequence: 0 in `docs/ROADMAP.md` (runs before everything else). Depends on: nothing.
Files owned: `.github/workflows/ci.yml` (new), `frontend/src/app/{error,global-error}.tsx`
(new), `frontend/src/hooks/useDraftEngine.ts` (bot profile seeding only),
`frontend/src/app/deckbuilder-test/page.tsx` (sessionId pass-through only),
`frontend/src/app/rosters/page.tsx` (link query only), `frontend/src/components/PackOpener.tsx`
(effect hygiene only), `frontend/src/app/test-ui/page.tsx`, `frontend/src/components/DraftRoom.tsx`
(one lint fix), `frontend/tests/smoke.spec.ts` (new), `frontend/src/storage/*` (safe-load only).

## Goal

A cheap pass, under one day, that removes the defects most likely to bite every later plan
and adds the two safety nets the repo lacks: continuous integration and a runtime error
boundary. Nothing here changes game behaviour or UI design. When it is done, a broken
commit fails CI, a runtime error shows a recovery screen instead of a blank page, drafts are
reproducible from their seed as the docs already claim, and editing a roster no longer
loses its season.

## Decisions (locked)

- D1 CI: GitHub Actions on push and pull request, ubuntu, Node 22: `npm ci` in root and
  `frontend/`, then `npx tsc --noEmit`, `npm run lint`, `npm test` (Vitest), `npm run
  build`. Playwright is not run in CI (win32 snapshots, needs a server); it stays a local
  gate. Lint must pass, so the 8 remaining errors are fixed in this plan (D6).
- D2 Error boundary: `app/error.tsx` and `app/global-error.tsx` render a recovery screen
  with the error message, a "Try again" button (`reset()`), a link home, and a
  "Reset local data" button that clears the IndexedDB store after a confirm dialog. The
  same component is reused by both files.
- D3 Safe loads: every store read that returns saved game data (`getDraftSession`,
  `getRoster`, `getSeason`, list variants) runs the existing normalizers
  (`normalizeSeason`, `normalizeBuiltRoster`) and returns `null` for records that fail
  a shape check, logging once, instead of throwing into the page. A Vitest case feeds a
  corrupt record through each path.
- D4 Draft reproducibility: bot `noiseSeed` and `favoredTrait` are drawn from the draft's
  seeded rng (`createRng(seed)`) in `useDraftEngine.startNewDraft`, not `Math.random`,
  so the same `draftSeed` yields the same bot picks. `deckbuilder-test`'s random sandbox
  may keep `Math.random` (dev only).
- D5 Roster edit keeps its season: `/rosters` passes `sessionId` in the edit link and
  `deckbuilder-test` forwards it to `DeckBuilder`, so re-saving keeps `sessionId` and the
  Play Season button. (The UI plan later moves this to `/roster/[id]`; this is the
  one-line fix until then.)
- D6 Lint clean: the 7 `no-explicit-any` in `app/test-ui/page.tsx` get real types from
  `engine/types.ts`; the `set-state-in-effect` in `DraftRoom.tsx` is restructured (derive
  `isClient` from a mount ref or `useSyncExternalStore`). Warnings are not in scope
  beyond what `--fix` removes.
- D7 PackOpener hygiene: the keydown effect gets a dependency array with a ref for
  `phase`; the reduced-motion path also gates the deal stagger; the duplicated timer
  cleanup is removed. No visual change.
- D8 Smoke spec: `frontend/tests/smoke.spec.ts` opens `/`, `/draft`, `/rosters`,
  `/season`, `/data`, `/debug`, `/deckbuilder-test`, `/pack-opener-preview` and asserts
  no `pageerror` and no console `error` entries, at 1280x800. It is the local gate every
  later plan runs before committing.
- D9 Docs: AGENTS.md "Commands" lists the CI gate; HANDOVER gets the milestone line.

## Out of scope

Any UI redesign (ui_draft_deckbuild_pack), the analyzer rewrite (analytics_tooling),
persistence shape changes (data_storage), lint warnings, dependency upgrades, Playwright in
CI.

## Tasks

- T1 CI workflow per D1; verify on a pushed branch. Tier: low.
- T2 Error boundary per D2. Tier: mid.
- T3 Safe loads per D3 with the corrupt-record tests. Tier: mid.
- T4 Draft seeding per D4 plus a Vitest asserting two drafts with the same seed produce
  identical bot profiles. Tier: mid.
- T5 Roster edit sessionId per D5. Tier: low.
- T6 Lint errors per D6. Tier: low.
- T7 PackOpener hygiene per D7. Tier: low.
- T8 Smoke spec per D8. Tier: low.
- T9 Docs per D9. Tier: low.

## Parallelization

One wave, all nine tasks in parallel; every task owns disjoint files. The driver then
runs tsc, lint, Vitest, the smoke spec, and commits per task (`fix:` / `chore:` prefixes).
Wall-clock with agents: about half a day.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro. Agents: Sonnet 5 / Gemini 3 Pro for T2-T4, Haiku
4.5 / Gemini 3 Flash for the rest. No top-tier model needed.

## Verification / exit criteria

- CI green on the branch: tsc, lint (0 errors), Vitest, build.
- `npm run test:e2e` locally: smoke spec passes on every listed route.
- Manual: throw inside a component in dev and see the recovery screen; corrupt a season
  record in DevTools and the season list still renders; run two drafts with the same seed
  from `/debug` and compare bot pick logs; edit and re-save a roster, Play Season stays.
