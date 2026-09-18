# Plan: challenge_loose_ends

File: `docs/completed/plan_challenge_loose_ends_2026-09-19.md`. Status: done 2026-09-19
Sequence: 8 in `docs/ROADMAP.md`. Depends on: phone_card (done), challenge_mode (done).
Files owned: `frontend/src/components/PlayerCard.tsx`, `frontend/src/components/PackRevealCard.tsx`,
`frontend/src/components/DraftRoom.tsx`, `frontend/src/components/challenge/Results.tsx`,
`frontend/src/app/rosters/page.tsx`, `frontend/src/hooks/useUserSeasonStats.ts`,
`frontend/src/components/TopNav.tsx`.

## Goal

Four gaps the owner hit while using the app: play cards never got the phone-card resize
that player cards got; a finished 82:0 run's results screen dumps the player straight into
"Draft a new team" instead of giving them a clear moment that says the run is over and
locked in; the rosters list can't tell a finished 82:0 run from an unstarted one; and user
stats never mention 82:0 at all. None of these change engine behavior — they close UI/data
gaps around an already-working system (`saveChallengeRun` already persists every half
before it animates, and the run is already `phase: 'done'` by the time results render).

## Decisions (locked)

- **D1 (play card parity).** `PlayCardFront`/`PlayCard` (`PlayerCard.tsx:1014,1077`) get the
  same `wide?: boolean` prop and phone-only overrides `PlayerCardFront`/`PlayerCard` already
  have (`:464-519`, `:714-774`): `pointer-coarse:max-lg:aspect-[1.15/1]!` on the card,
  matching badge-gap bump. Apply at the same call sites that pass `wide` to the player
  version: `PackRevealCard.tsx:43,49,52` and `DraftRoom.tsx`'s play-card render (`:562-574`).
  `rosters/page.tsx:300`'s `PlayCard ... compact` stays untouched — that's a small inline
  summary card, not a phone draft/pack-sized card, same reasoning phone_card D1 used to
  exclude `DepthSlotColumn`.
- **D2 (explicit "end the run" CTA on the results screen).** `ResultsScreen` (mounted only
  at `phase === 'done'`, `Results.tsx:373`) currently ends with one bottom-right primary
  button: `<Button href="/" size="lg">Draft a new team</Button>` (`:512`), which frames the
  finished run as a launchpad into something new rather than a concluded result. Replace it
  with a primary CTA that reads as closing this run out: **`End Challenge — Results Locked
  In`**, `href="/rosters"` (not `/`), same `Button` component/position. The run's data is
  already saved at this point (`finishRun` in `app/challenge/[rosterId]/page.tsx:209-216`
  sets `phase: 'done'` and commits before this screen ever mounts), so the button does no
  new persistence — its job is to give the player a clear, deliberate "this is over" moment
  and land them on `/rosters`, where T3 below now shows this run as `View Result` with its
  final record. "Draft a new team" is dropped from this screen entirely; starting a new
  draft already has its own entry point from `/rosters`/the start page.
- **D3 (rosters list state).** In `rosters/page.tsx`, fetch each challenge roster's run via
  `getChallengeRunByRoster(rosterId)` alongside the existing season fetch. Button label
  (`:275`): no run → `Start 82:0`; run exists and `phase !== 'done'` → `Continue 82:0`;
  `phase === 'done'` → `View Result`. For a `done` run, show a one-line summary under the
  entry: total wins/losses (`halves[0].wins + halves[1].wins`, same for losses) and the
  grade from `gradeForWins(totalWins)` (`engine/challenge.ts:213`), e.g. `62-20 · Dynasty (A-)`.
  This is the FINAL record on a finished run, not a mid-run reveal, so it does not conflict
  with the "record stays sealed until game 82" rule (`AGENTS.md`) — that rule governs the
  in-run break screen, not a completed run's own results list.
- **D4 (user stats).** `useUserSeasonStats`/`computeUserSeasonStats` (`engine/season.ts:507`)
  stay season-only (different scale, already correct for what they measure). Add a sibling
  read of `listChallengeRuns()` filtered to `phase === 'done'`, surfaced as one extra line
  wherever `computeUserSeasonStats`'s output renders (`TopNav.tsx:107,202`): `82:0
  Challenges: {completed} completed, best {wins}-{losses} ({grade})`. Best = the run with
  the highest win total among completed runs. Zero completed runs → line is omitted
  entirely, not shown as "0 completed".

## Out of scope

- Any change to the reel/phase machine itself (skip controls, back-guards, resuming mid-half)
  — the run is already correctly saved half-by-half before this plan; D2/T3 close the gap by
  making that saved state visible and giving the finished screen a clear closing action, not
  by changing how or when halves are simulated.
- Any change to `ChallengeRun`/`ChallengeHalf` storage shape — D3/D4 read existing fields
  only.
- A dedicated 82:0 stats page/breakdown — D4 is one summary line, not a new screen.

## Tasks

- **T1 — Play card `wide` parity.** Files: `PlayerCard.tsx`, `PackRevealCard.tsx`,
  `DraftRoom.tsx`. Done-when: phone-viewport (browser-pane touch emulation, ~760x385)
  screenshot of a pack reveal and the draft grid shows play cards at the same 1.15/1 aspect
  as player cards; `npm test` clean. Tier: mid.
- **T2 — Results screen closing CTA.** Files: `components/challenge/Results.tsx`.
  Done-when: `ResultsScreen`'s primary button reads "End Challenge — Results Locked In" and
  navigates to `/rosters`; "Draft a new team" no longer appears on this screen; `npm test`
  clean (no `Results.spec`/unit test references the old label). Tier: low.
- **T3 — Rosters list challenge state.** Files: `rosters/page.tsx`. Done-when: a fresh
  challenge roster shows "Start 82:0" with no summary; a mid-run one shows "Continue 82:0";
  a finished one shows "View Result" plus the record/grade line, verified against a
  `/challenge/preview-results`-style fixture or a real completed run in dev. `npm test` clean.
  Tier: mid.
- **T4 — User stats 82:0 line.** Files: `useUserSeasonStats.ts` (or a sibling hook if
  cleaner), `TopNav.tsx`. Done-when: with zero completed runs the line is absent; with one
  or more, it matches D4's format exactly. `npm test` clean. Tier: mid.

## Parallelization (optional)

T1, T2, T3, T4 all touch disjoint files and are fully independent — no shared contracts.

Wave 0: none needed.
Wave 1 (parallel): T1 (mid), T2 (low), T3 (mid), T4 (mid).

## Recommended model tier

Main driver: mid (Sonnet 5 / Gemini 3 Pro) — these are UI/data-plumbing tasks against an
already-locked engine, no balance or math decisions. T2 is copy-and-link-only (low tier);
T1/T3/T4 are mid tier.

## Verification / exit criteria

- `npm test` (root) clean, no new failures beyond the two pre-existing drifts already
  tracked in `docs/HANDOVER.md`.
- `tsc --noEmit`, `npm run lint`, `npm run check:styles` all clean.
- `npm run test:e2e` smoke 9/9.
- Screenshot (browser-pane, phone viewport) of a pack reveal showing a resized play card
  (T1) and of the rosters list showing all three challenge button states (T3).
- Screenshot of a completed run's results screen (`/challenge/preview-results`) showing the
  new "End Challenge — Results Locked In" CTA in place of "Draft a new team" (T2), and a
  live click confirming it lands on `/rosters`.
