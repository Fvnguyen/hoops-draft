# Plan: draft_resume

File: `docs/plans/plan_draft_resume_2026-09-22.md`. Status: planned.
Sequence: 14 in `docs/ROADMAP.md`. Depends on: nothing (`sync_outbox` done).
Files owned (under `frontend/src/` unless noted): `engine/draftReplay.ts` (new), `engine/draft.ts`,
`engine/deckbuilder.ts` (the `DraftSession`/`DraftPickRecord` types only), `hooks/useDraftEngine.ts`,
`components/DraftRoom.tsx`, `app/draft/page.tsx`, `storage/types.ts`, `tests/unit/draft-replay.test.ts` (new),
`tests/draft-resume.spec.ts` (new), `docs/game_mechanics.md` (draft section).

## Goal

A draft survives an OS kill, a reload or a phone lock. The whole draft is a pure function of its seed and
the human's picks (bots are deterministic from the seed), so the app stores the seed plus the pick log after
every human pick and rebuilds the exact room on return. This is also the substrate the PvP plans stand on:
`pvp_draft` needs "rebuild the room from a seed and two humans' pick lists" and gets it from here.

## Decisions (locked)

- D1. `engine/draftReplay.ts` (new, pure): `replayDraft(seed, humanPicks, allPlayers, playsDB): DraftState`.
  `humanPicks` is `Record<seatId, string[]>` (card ids in pick order; solo drafts have one key,
  `'human-0'`). Bots are `createBotProfiles(rng)` + `getBotPick` exactly as `useDraftEngine` runs them
  today, in the same rng order. Replay stops at the first pick a human seat has not made and reports
  `awaiting: seatId[]`. `DraftState` = `{ seats, packNumber, pickNumber, overallPick, pickLog, awaiting,
  phase: 'drafting' | 'complete' }`. Seat ids stay `human-<i>` / `bot-<i>` by seat index so the existing
  `DraftPickRecord.seatId` values remain valid.
- D2. `useDraftEngine` keeps its public API (`startNewDraft`, `applyPick`, `processPickAndPass`,
  `pickFromIntro`, `startNextRound`, `expirePick`, `armIntroClock`, the state fields) but its source of
  truth becomes `(seed, humanPicks)`; `seats`/`pickLog`/counters are derived through `replayDraft`. The
  cube packs are no longer cached in a ref; `generateCubePool(rng)` runs inside the replay. View state
  (intro clock, `passSeq`, round-summary pause, `pickDeadline`) stays in the hook.
- D3. Persistence: after every human pick the hook writes the in-progress `DraftSession` (new field
  `status: 'drafting' | 'complete'`, plus `humanPicks` and `mode`) through `getGameStore()`; the outbox
  syncs it like any row. 36 CAS upserts on one key per draft is inside the outbox's budget (`sync_outbox`
  dropped a per-pick autosave that also stored packs; this stores 36 card ids).
- D4. Resume prompt: `/draft` with an unfinished session for the current owner shows a sheet, "Resume
  draft, pack 2 pick 5" or "Abandon" (abandon deletes the session through the store). No auto-resume.
- D5. Pick clock on resume: the clock restarts for the current pick at the mode's full length; picks that
  would have expired while the app was closed are not auto-taken. A solo draft is frozen while away.
  `pvp_draft` overrides this for shared rooms.
- D6. Equivalence is the test: 200 seeded headless drafts through the live path and through
  `replayDraft` from their pick logs give identical pick logs, seats and drafted cards, and
  `replayDraft` of a truncated pick list reports the right `awaiting` seat and pack contents.

## Out of scope

Two humans in one room (`pvp_draft`). Any change to bot valuation, pack generation or pick timing
constants. Round-summary and intro-opener behaviour (unchanged, only moved). Migrating old completed
sessions (they have no `status`; treat missing as `'complete'`).

## Tasks

- T1 (top). Contracts: `DraftState`, `replayDraft` signature, `DraftSession.status/humanPicks/mode`,
  the store read for "unfinished session for owner". Files: `engine/draftReplay.ts` (stub), `storage/types.ts`,
  `engine/deckbuilder.ts`. Done: `tsc` clean.
- T2 (mid). `replayDraft` + `tests/unit/draft-replay.test.ts` (D6, including a property test over 50
  random truncation points). Done: tests green, `engine-purity.test.ts` still green.
- T3 (mid). `useDraftEngine` over `replayDraft` (D2). Done: `tests/draft.spec.ts` and `visual.spec.ts`
  zero diff, `npm test` green, the hook has no `cubePacksRef`.
- T4 (mid). Persistence + resume sheet (D3, D4, D5) in `DraftRoom.tsx`/`app/draft/page.tsx`, and
  `tests/draft-resume.spec.ts`: reload at pack 2 pick 5, resume, same packs on screen, finish the draft,
  the deck builder opens with 21 cards; abandon deletes. Done: spec green at `--workers=1`.
- T5 (low). `docs/game_mechanics.md` draft section: seed + pick log is the record. Done: doc diff only.

## Parallelization

Wave 0: T1 (driver). Wave 1: T2 and T3 in parallel (disjoint: engine file + test vs hook). Wave 2: T4.
Wave 3: T5. Agents never run git.

## Recommended model tier

Driver: top (Fable 5.1 / Gemini 3 Pro) for T1 and review; T2-T4 mid (Sonnet 5 / Gemini 3 Pro); T5 low
(Haiku 4.5 / Gemini 3 Flash). The equivalence test is what makes a mid-tier refactor of the hook safe.

## Verification / exit criteria

`npm test` green (count does not drop); `npx playwright test draft draft-resume visual smoke
--project=chromium --workers=1` green with no snapshot updates; `tsc`, `lint` (0 errors), `check:styles`
0; `npx tsx scripts/bench-engine.ts` checksum 219438687 (no engine sim change). Phone: the resume sheet at
`--project=phone-landscape` audit, 0 findings.
