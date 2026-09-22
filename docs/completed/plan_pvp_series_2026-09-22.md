# Plan: pvp_series

File: `docs/plans/plan_pvp_series_2026-09-22.md`. Status: done 2026-09-22.
Sequence: 17 in `docs/ROADMAP.md`. Depends on: `pvp_match`, `pvp_draft`.
Files owned (under `frontend/src/` unless noted): `engine/playoffs.ts` (new), `engine/challengeAdvice.ts`
(input adapter only), `app/api/match/[id]/advance/route.ts` (new), `app/playoffs/[id]/page.tsx` (new),
`app/playoffs/[id]/game/[n]/page.tsx` (new), `app/playoffs/page.tsx` (new), `components/playoffs/{SeriesStrip,
CoinFlip,PlayoffsFrontOffice,SeriesResults}.tsx` (new), `components/challenge/{FrontOffice,Trade}.tsx` (props
only), `components/GameView.tsx` (opponent-reveal gate only), `components/HomeModePicker.tsx`,
`app/page.tsx`, `hooks/useUserSeasonStats.ts`, `components/TopNav.tsx` (`ProfileSummary` line),
`tests/unit/playoffs.test.ts` (new), `tests/pvp-series.spec.ts` (new), `docs/game_mechanics.md`.

## Goal

The two locked rosters play a best-of-seven. A coin flip gives home court in the NBA 2-2-1-1-1 pattern,
each game is simulated on the server and watched by each player at their own pace, and when one side
reaches two wins both players get the 82:0 front office: hold, adjust the lineup, or make one trade.
The winner's series goes on both profiles and a rematch is one tap.

## Decisions (locked)

- D1. `engine/playoffs.ts` (pure): `coinFlip(seed)` = `mixSeed(seed, 'coin') & 1 ? 'guest' : 'host'`;
  `homeFor(game, flipWinner)`: games 1, 2, 5, 7 at the flip winner, 3, 4, 6 at the other;
  `seriesState(games)` = wins per side, `over` at 4, `sideboardDue` the first time either side has 2 wins
  and the sideboard has not happened; `gameSeed(seed, n) = mixSeed(seed, 'game:<n>')` (the simulate route
  in `pvp_match` D7 calls these).
- D2. Advancing: `POST /api/match/[id]/advance` is the only writer of status after `series` begins. Game 1
  simulates when both rosters are locked. Game n+1 simulates when both players have opened game n
  (`match_seen`) or 24 hours after the first of them did, so a vanished opponent cannot freeze the series;
  the 7-day forfeit still applies to a player who never opens anything. When `sideboardDue`, status moves to
  `sideboard` and no game simulates until both have locked their sideboard (or 7 days pass).
- D3. Watching: `/playoffs/[id]/game/[n]` replays the stored game through `GameView` from its seed with
  `userSide` = the viewer's side. Before tip-off the opponent's five starters are shown exactly as the
  tournament matchup preview shows them (`TeamStarters`); bench, plays and identity are never listed, the
  box score reveals what plays. Between games the series page shows the opponent's name and record only.
- D4. Sideboard = the 82:0 deadline reused. `PlayoffsFrontOffice` renders `FrontOffice`'s quote pools and
  actions (`hold | lineup | plays | trade`) fed by a `ChallengeAdviceInput` built from the series' games so
  far (`challengeTeamSplits` over 2-3 games instead of 41; the pace band is replaced by the series score,
  no W-L is hidden here because it is the opponent's score, not a sealed record). Lineup/plays edit uses
  `DeckBuilder` over the player's 21 drafted cards (the 9 unrostered cards are the sideboard). Trade uses
  `Trade` with `drawTradeOffers(allCards, ownedIds = both players' drafted cards, droppedRarity,
  createRng(mixSeed(seed, 'trade:<side>')))`, `TRADE_OFFERS` and weights unchanged; one trade or none.
  Both sides act blind and simultaneously; `match_sideboard(roster, trade)` locks; the series resumes when
  both have locked. The sideboarded roster is a new snapshot; the drafted roster is never mutated.
- D5. The series page `/playoffs/[id]`: `CoinFlip` plays once per viewer (result stored client-side as
  seen), then `SeriesStrip` (seven slots, home marks, scores, "Watch" / "Waiting for <name>" / "Sideboard
  open"), the opponent's name and online state. `/playoffs` lists my matches (pending invites, in progress,
  done) and is where the notices link.
- D6. Results: `SeriesResults` shows the line (4-2), per-game scores and homes, MVP by box score, and
  "Rematch" (the loser invites the winner with a fresh seed through `match_invite`). `computeUserSeasonStats`
  gains `playoffs: { series, wins, losses }`; `ProfileSummary` shows "Playoffs: W-L series" when > 0.
- D7. Entry: a third "Playoffs" card on the home mode picker (`HomeGame` gains `'playoffs'`), routing to
  `/playoffs/new`; `mode_picker` (#10) restyles the picker later and keeps this entry.
- D8. Tuning: tournament constants only (`HOME_NOISE_*` as they are, edge 0.20/0.08). No balance change.
  Overtime as in any game; a series game cannot tie.

## Out of scope

Best-of-five or other lengths, seeding across several matches, brackets, spectators, chat, push
notifications, a friends list, the picker redesign (`mode_picker`), anything that retunes home court.

## Tasks

- T1 (top). Contracts: `engine/playoffs.ts` API, `MatchGame` reveal fields, `PlayoffsFrontOffice` and
  `SeriesStrip` props, `HomeGame 'playoffs'`. Done: `tsc`.
- T2 (mid). `engine/playoffs.ts` + `tests/unit/playoffs.test.ts` (home pattern for both flip results,
  `sideboardDue` at 2-0 and 2-1 exactly once, `seriesState` over every 4-x line, seeds distinct per game).
  Done: tests green, purity test green.
- T3 (mid). `advance` route (D2) + unit tests with fixture rows (game 1 after both locks; n+1 after both
  seen; after 24 h with one seen; blocked during sideboard; forfeit path). Done: `tests/unit/match-advance.test.ts`.
- T4 (mid). Series page, coin flip, strip, game page with the reveal gate in `GameView` (D3, D5). Done:
  screenshots at 1440 and phone-landscape, smoke green.
- T5 (mid). `PlayoffsFrontOffice` + advice adapter + `Trade` reuse + lock (D4). Done: unit test that the
  adapter yields at least three reasons from a 2-1 series and never a rating; screenshot of the screen.
- T6 (mid). Results, profile stats, rematch, `/playoffs` list, home entry (D6, D7). Done: `home.spec.ts`
  extended, `topnav.spec.ts` green.
- T7 (mid). `tests/pvp-series.spec.ts`: seed a match at `series` with two locked fixture rosters, two
  contexts watch game 1 and 2, the strip agrees on both, sideboard opens at 2-0, both lock (one trades, one
  holds), games continue to a 4-x result, results and profile lines on both. Done: green at `--workers=1`.
- T8 (low). `docs/game_mechanics.md` Playoffs section, `docs/ARCHITECTURE.md` §6c. Done: doc diff only.

## Parallelization

Wave 0: T1 (driver). Wave 1: T2, T3 in parallel (engine vs route). Wave 2: T4, T5, T6 in parallel
(disjoint components and pages). Wave 3: T7. Wave 4: T8. Agents never run git or touch Supabase.

## Recommended model tier

Driver top (Fable 5.1 / Gemini 3 Pro) for the contracts, the advance rules and reviewing the reveal gate
(a leak here shows an opponent's roster). T2-T7 mid (Sonnet 5 / Gemini 3 Pro), T8 low (Haiku 4.5 /
Gemini 3 Flash).

## Verification / exit criteria

`npm test` green; `tests/pvp-series.spec.ts` green with two contexts; `visual.spec.ts` and
`game-view-render.spec.ts` zero diff (the reveal gate must not change the tournament game view); `tsc`,
`lint` 0 errors, `check:styles` 0; bench checksum 219438687 and `node scripts/balance-baseline.mjs`
IDENTICAL (no engine sim change); `challengeAdvice.test.ts` still asserts no rating in any quote; phone
audit of series, game and sideboard screens 0 findings; owner plays one full series against a second
account, including a sideboard trade, before `/roadmap done`.
