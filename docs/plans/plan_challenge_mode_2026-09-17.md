# Plan: challenge_mode

File: `docs/plans/plan_challenge_mode_2026-09-17.md`. Status: planned
Sequence: 9 in `docs/ROADMAP.md`. Depends on: none. Files owned: see Tasks.

## Goal

After a normal draft (quick or premier) and deckbuilder save, the player can choose
"82:0 Challenge" instead of a round-robin season: an 82-game gauntlet against all 30 real
2026 NBA rosters (built from our own cards), with a mandatory checkpoint after game 41 to
adjust the depth chart and make exactly one trade, ending in an S-to-F grade on the full
season. This gives the draft/deckbuild loop a second, higher-stakes destination without
touching the existing round-robin season.

## Decisions (locked)

D1. **Entry point.** Insert a mode choice ("Round Robin Season" / "82:0 Challenge") at the
    same point `DeckBuilder.tsx:990` and `app/rosters/page.tsx:248` currently
    `router.push('/season?...')`. Round-robin behaviour is unchanged. Challenge routes to
    `/challenge/[rosterId]?sessionId=...`.
D2. **Opponent rosters, one per real team.** New pure fn `buildNbaTeamRoster(cards,
    teamAbbr)` in `engine/challenge.ts`: filter `cards.json` by `PlayerBio.team ===
    teamAbbr`, take the top 15 by OVR (not 12) into `buildBotRoster`, then trim the
    result's bench down to `TARGET_ROSTER = 12`, keeping all 5 starters. Team without
    enough cards for a position: backfill that slot from the next-best remaining player
    on the same team regardless of natural position rather than leaving it empty (open
    issue 8 in HANDOVER — a 4-on-5 possession is not acceptable for a marquee mode).
    Fix `PHX`/`CHA`/`BKN` vs `PHO`/`CHO`/`BRK` mismatch in `cardColors.ts:102-122` first
    (T1) so all 30 opponents resolve a team colour/logo. Skip any of the 30 teams that
    end up with zero eligible cards (none currently do — 448 cards cover all 30 at
    13-17 each) rather than erroring.
D3. **Schedule, 82 games from 30 teams.** `generateChallengeSchedule(seed)`: seed an `Rng`,
    shuffle the 30 team abbreviations, repeat the shuffled sequence 3x (90 slots), take
    the first 82 (drops the last 8 of the third pass — those 8 teams appear twice, the
    other 22 three times). Home/away alternates by game index parity (even = user home),
    matching the existing home-court convention in `simulateGame`. Schedule order is the
    flattened sequence order; no day/back-to-back modelling.
D4. **No permadeath.** All 82 games play out regardless of result; a loss breaks the win
    streak and lowers the final grade but never ends the run early. "82:0" is the
    aspirational name, not an enforced constraint.
D5. **Midseason checkpoint.** Fires exactly once, when `currentGame === 41`: a full-screen
    break showing the season stat line so far (reuse existing season/box-score
    components), the depth chart in edit mode (swap-only — same players, no new draft),
    and the one-time Trade action. The run cannot advance past game 41 until the player
    dismisses the checkpoint.
D6. **Trade.** Exactly one per run, usable only inside the midseason checkpoint. Player
    drops one roster card; a "Trade Pack" of 5 cards opens (`PackOpener.tsx` reused with a
    `variant="trade"` prop driving a gold-trim CSS treatment on the existing pack art, no
    new image assets) drawn from the full 448-card pool minus cards already on the
    player's roster or bench. Rarity weights: base `{Common:55, Uncommon:30, Rare:12,
    Mythic:3}`, then the dropped card's rarity weight is multiplied by 4 and the table
    renormalized before sampling 5 distinct cards without replacement. Player picks 1 of
    the 5 to replace the dropped card 1-for-1 in the roster/depth chart slot.
D7. **Grading.** `gradeChallengeRun(wins)` over 82 games: S = 82, A = 70-81, B = 55-69,
    C = 40-54, D = 20-39, F = 0-19. Bands are contiguous 0-82, no gaps.
D8. **Storage.** New `ChallengeRun` entity mirroring `Season`'s shape (`id, sessionId,
    rosterId, timestamp, seed, schedule: ChallengeGame[], standings/wins/losses,
    currentGame, tradeUsed: boolean, humanTeam`) with its own store methods
    (`listChallenges/getChallenge/saveChallenge/deleteChallenge`) rather than overloading
    `Season`, since `Season`'s normalize/standings helpers assume 7-game round robin.
D9. **Flavor additions (own proposals, in scope for this plan):**
    - Shareable seed: display the run's seed as a short code on the dashboard and results
      screen with a copy button; starting a new challenge accepts a pasted seed to
      reproduce the same opponent schedule and trade-pack pulls (the engine is already
      fully seeded, this is pure UI).
    - Streak milestone toasts at 10/25/41/60/82 consecutive wins (cosmetic only, no
      mechanical effect) — mirrors the ante/streak beats of current run-based games.
    - End-of-run share card: an in-app panel (S-F grade, final record, longest win streak,
      seed) sized for a screenshot, reusing the existing `scripts/screenshot.js` pattern
      manually rather than adding an export pipeline.
    Explicitly out of scope: no iron-man/permadeath mode, no live league-wide standings
    for the other 29 teams (only the user's 82 results are tracked), no custom pack art.

## Out of scope

Full league simulation (other 29 teams playing each other), playoff bracket after the 82
games, more than one trade per run, Supabase cloud-sync conflict merging for
`ChallengeRun` beyond a straight copy of `Season`'s pattern, new pack artwork.

## Tasks

T1 (low). Fix `PHX`/`CHA`/`BKN` vs `PHO`/`CHO`/`BRK` in `frontend/src/components/cardColors.ts`.
Done-when: a script/test resolves a non-null colour and logo path for all 30 abbreviations
present in `cards.json`.

T2 (top). `frontend/src/engine/challenge.ts` (new) + additions to `engine/types.ts`
(`ChallengeRun`, `ChallengeGame`, `Tier`) and `engine/balance.ts` (`CHALLENGE_GAMES=82`,
`MIDSEASON_BREAK=41`, `TIER_BANDS`, `TRADE_PACK_SIZE=5`, `TRADE_BASE_RARITY_WEIGHTS`,
`TRADE_SKEW_MULTIPLIER=4`). Implements D2/D3/D6/D7. Done-when: new
`frontend/tests/unit/challenge.test.ts` passes: all 30 teams produce a 12-man roster with
all 5 depth-chart slots non-empty; the 82-game schedule has each team 2-3 times; grade
bands cover 0-82 with no gaps; 1000 trade-pack draws for a dropped Mythic land meaningfully
above the 3% base Mythic rate.

T3 (mid). `ChallengeRun` storage: `frontend/src/storage/types.ts`,
`indexedDb.ts` (new Dexie table + version bump), `memory.ts`, `supabase.ts` (copy
`Season`'s save/list/get/delete pattern, skip CAS merge — last-write-wins is acceptable
per D-scope). Done-when: a storage unit test round-trips a `ChallengeRun` through the
IndexedDB and memory backends.

T4 (mid). Mode-select UI at the two save points named in D1; new route
`frontend/src/app/challenge/[rosterId]/page.tsx`. Done-when: `npm run screenshot -- /rosters
rosters.png` (or the deckbuilder save flow) shows the mode choice.

T5 (top). `ChallengeDashboard` component: next opponent, record, tier projection, "Play
next game" wired to `simulateGame` against the T2 opponent roster, streak display and
milestone toasts (D9). Done-when: a manual playthrough in dev advances several games and
`currentGame`/standings persist across a reload.

T6 (mid). Midseason checkpoint component: stats recap, swap-only depth-chart edit (reuse
deckbuilder depth-chart subcomponents in a modal), Trade flow (drop card -> `PackOpener`
`variant="trade"` -> pick 1 of 5 -> roster updated, `tradeUsed` set). Done-when: a
screenshot of the trade pack opener with the gold-trim variant, and a before/after roster
diff from a manual trade in dev.

T7 (mid). Results screen: S-F grade banner, seed display/copy, seed-paste on new-run start,
share card (D9). Done-when: screenshot of the results screen for a forced-seed run in dev.

T8 (low). Docs: add an "82:0 Challenge" section to `docs/game_mechanics.md`; add
`engine/challenge.ts` to the `AGENTS.md` repo map.

## Parallelization

Wave 0 (driver, top tier): T1, T2 — everything else depends on the `ChallengeRun`/
`ChallengeGame` types and the roster/schedule/trade-pack builders.
Wave 1 (parallel, mid tier): T3 (storage) and T4 (mode-select UI, only needs T2's types).
Wave 2 (parallel): T5 (dashboard, needs T2+T3) and T6 (checkpoint+trade, needs T2+T3).
Wave 3: T7 (needs T5 and T6 wired up end to end).
Wave 4 (low tier): T8, after everything else lands.

## Recommended model tier

Main driver: top (Fable 5.1 / Opus 5) — owns T1/T2 (new balance constants: trade odds,
grade bands, schedule shape) and verifies/commits every wave. Waves 1-3 agents: mid
(Sonnet 5 / Gemini 3 Pro). Wave 4: low (Haiku 4.5 / Gemini 3 Flash).

## Verification / exit criteria

- `npm test` green, including `challenge.test.ts` (T2 done-when) and the T3 storage
  round-trip test.
- `npm run balance` before/after unchanged (challenge mode adds no round-robin/engine
  changes) — quote PPP before and after in the closing commit.
- Screenshots for T4 (mode select), T6 (trade pack variant), T7 (results screen).
- One full manual playthrough in dev: draft (either mode) -> deckbuilder -> "82:0
  Challenge" -> play to game 41 -> checkpoint (edit depth chart, make the trade) -> resume
  -> finish all 82 games -> results screen shows a grade and a seed; reload mid-run
  confirms `currentGame`/standings/`tradeUsed` persisted correctly.
