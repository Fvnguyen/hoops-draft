# Plan: challenge_mode

File: `docs/plans/plan_challenge_mode_2026-09-17.md`. Status: planned (rewritten 2026-09-17
after the reference-game review and canvas sign-off). Sequence: 9 in `docs/ROADMAP.md`.
Depends on: none. Design: canvas "82:0 Challenge Mode"
https://claude.ai/artifact/P7XLqF4kogeY7kvu4h4X7W, sources in `docs/design/challenge_mode/`
(boards 1a-1c, 2-7 signed; `Main` is backlog, not this plan).

## Goal

A second game mode modelled on the viral "82-0" browser games: pick the mode on the start
page, draft and build as usual, then one 82-game season against all 30 real NBA rosters
(built from our cards) revealed as a slot-machine style flip clock in two spins, with a
trade deadline and lineup reset in between and one final grade. About four minutes, no
single-game screens, no narration. The existing 7-game mode is renamed "In-Season
Tournament" and is otherwise untouched.

## Decisions (locked)

D1. **Mode is chosen before the draft.** Start page (board 1a): primary buttons
    "In-Season Tournament" (cream) and "82:0 Challenge" (dark, gold) replace Premier/Quick;
    clicking one dims the other and opens two hovering option cards, Premier vs Quick
    Draft (1b cream, 1c dark; clock-ring motif amber vs chevron motif blue). Route
    `/draft?mode=premier|quick&game=tournament|challenge`; `DraftSession.gameMode?:
    'tournament' | 'challenge'` (missing = tournament). The deck builder's save CTA routes
    by `gameMode` ("Save & play season" / "Save & start 82:0" -> `/challenge/[rosterId]`);
    no post-draft choice, and a roster can only start the mode it was drafted for.
D2. **Theme.** Challenge routes are dark (`surface-inverse-deep` shell, Bebas digits, amber
    accent); tournament stays cream. Draft room and deck builder are NOT re-themed in v1;
    a gold "82:0" header badge marks a challenge session. Rename scope: home button and
    SeasonView title only.
D3. **Opponents.** Pure `buildNbaTeamRoster(cards, teamAbbr)`: top 15 by OVR on
    `player.team` into `buildBotRoster` together with the full play catalog (so it picks
    the best 3 staffable plays + `chooseBotArchetypes`), trimmed to 12; any empty
    depth-chart slot is backfilled with the best remaining player regardless of position
    (measured: MEM comes out with an empty slot today; four-on-five is not acceptable).
    Fix `PHX/CHA/BKN` vs `PHO/CHO/BRK` in `cardColors.ts` first.
D4. **Schedule and seeds.** 30 teams shuffled by the run seed, sequence repeated 3x, first
    82 taken; user is home on even indices. Every game's seed is derived from
    (run seed, game index) and the trade pack from (run seed, 'trade'), never from a shared
    stream, so reloads, speeds and skips cannot shift results. All 82 games always play.
D5. **Difficulty: challenge-only steepness.** Challenge games pass
    `CHALLENGE_TUNING: EdgeTuning` (`efficiencyScale`/`maxEffShift`) to `simulateGame`;
    the engine and tournament balance are untouched. Baseline measured 2026-09-17 (30
    drafts, opponents with plays): average bot seat 43 wins, best seat median 55, max 76.
    T1 calibrates so the best drafted seat's top decile reaches A+ (72+) and S is rare
    (order of one run in hundreds); numbers are quoted in the plan before T3 starts.
D6. **Grades** (reference-game ladder with +/-): S+ 82 Immortal; S 80-81 Perfect; A+ 72-79
    Historic; A 66-71 / A- 62-65 Dynasty; B+ 61 / B 59-60 / B- 57-58 Contender; C+ 55-56 /
    C 52-54 / C- 50-51 Playoff; D+ 47-49 / D 43-46 / D- 40-42 Lottery; F 0-39 Tanking.
D7. **The reveal is presentation over a finished sim.** `simulateHalf` runs 41 games in
    one call (~3 ms per game) and the result is committed before the animation starts;
    reloading replays the reveal. Flip clock W:L (boards 2, 3, 6): readable and slow for
    the first week, accelerates until the flaps blur, stays sealed through the break,
    becomes readable again for the last five games at locked speed. Speeds Slower /
    Normal / Instant; tap skips to the next stop. Progress bar is neutral, never coloured
    by result; streak call-outs (10/25/41/60/82) are the only result signal mid-reel.
D8. **Front office (board 4), once, after game 41.** Shows a pace band on the tier ladder
    (projected wins 2x first-half wins +/- 7, snapped outward to grade bands), never the
    record. Three quotes, Coach / Owner / Fans, from pure `engine/challengeAdvice.ts`: a
    ranked reason catalogue over first-half data (weakest four-factor vs league, bench
    player out-producing a starter, worst rotation plus-minus, unstaffed or failing play,
    identity one step from online, pace band) -> each reason has an action chip (Lineup /
    Plays / Trade / Hold), an evidence line from season stats, and 3-4 templates per
    speaker; a band starting at Historic yields Hold quotes ("do nothing"). Never OVR or
    ratings, never W-L. Actions: adjust lineup, plays and identity (existing deck-builder
    pieces, same 12 players plus the trade), one optional trade, "Spin the second half".
D9. **Trade (board 5).** Drop one roster card; five offers drawn without replacement from
    all 448 cards minus the user's cards, weights `{Common 55, Uncommon 30, Rare 12,
    Mythic 3}` with the dropped card's rarity x4, renormalised. The pick goes to the bench
    (user slots it); offers matching a quote's reason get an "Answers the coach/owner/fans"
    tag. `PackOpener` `variant="trade"` = gold trim on existing pack art.
D10. **Results (board 7).** Grade slam + title, record on the same flaps, win trend line
    (games above .500), dashed ghost line from game 41 = the same seeds played with the
    pre-trade roster, trade verdict tile (+/- wins, ghost grade), longest streak, season
    MVP by season averages, seed chip + copy, share card panel, "Season stats" (player
    totals), "Draft a new team". No game log, no per-game drill-in.
D11. **Storage.** New `ChallengeRun`: `id, ownerId, sessionId, rosterId, timestamp, seed,
    balanceVersion, phase ('first'|'break'|'second'|'done'), rosterPre, rosterPost?,
    trade?, halves[]: { results: string of W/L, scores, topPerformer per game, player
    totals }, ghost?`. No box scores. Own store methods and Dexie table; Supabase copy of
    the Season pattern with one merge rule: the later `phase` wins. `rosterPre/Post` are
    snapshots, the saved roster is never mutated by a trade.

## Out of scope

League-wide standings, playoffs, more than one trade, permadeath, re-theming draft room or
deck builder, renaming beyond D2, phone-specific boards (compact pass after desktop lands),
mode-specific draft rules and the limited-style picker (backlog board `Main`), hand-authored
per-team playbooks, new pack artwork.

## Tasks

T1 (top). Difficulty calibration: `frontend/scripts/challenge-sim.ts` (`npm run challenge`)
runs N seeded drafts x 82 vs D3 opponents and prints the win distribution per seat rank and
grade shares across an `EdgeTuning` sweep. Done-when: `CHALLENGE_TUNING` chosen against D5's
target, distribution table quoted in this plan, `npm run balance` unchanged.
T2 (top). `engine/challenge.ts` + types + `balance.ts` constants (D3, D4, D6, D7
`simulateHalf`, D9 pack, ghost run) and the `cardColors.ts` fix. Done-when:
`tests/unit/challenge.test.ts`: 30 rosters of 12 with no empty slot; schedule 82 with each
team 2-3 times; grade bands cover 0-82 without gaps; same seed + roster = same results
regardless of call order; dropped-Mythic packs well above the 3% base rate.
T3 (top). `engine/challengeAdvice.ts` (D8) + quote templates under `src/narration/
challenge/`. Done-when: unit tests cover each reason firing from a fixture half-season, the
Hold case, and an assertion that no output contains a rating or a W-L record.
T4 (mid). `ChallengeRun` storage (D11) in `storage/types.ts`, `indexedDb.ts` (version bump),
`memory.ts`, `supabase.ts`. Done-when: round-trip tests on memory + IndexedDB backends.
T5 (mid). Start page + routing (D1, D2): `app/page.tsx`, `gameMode` on the session through
`useDraftEngine`, deck-builder and `/rosters` CTAs, 82:0 badge, SeasonView title. Done-when:
screenshots matching boards 1a-1c; `home.spec.ts`/`smoke.spec.ts` updated and green.
T6 (top). Reel: `components/challenge/FlipClock`, `TierLadder`, `ChallengeReel` and
`app/challenge/[rosterId]/page.tsx` driving phase transitions. Done-when: screenshots
matching boards 2, 3, 6; reload mid-reel replays without changing the result.
T7 (mid). Front office + trade (boards 4, 5): quotes, pace band, lineup/plays/identity edit,
trade flow with `PackOpener variant="trade"`. Done-when: screenshots of both pace variants
and the trade pack; before/after roster snapshot diff from a dev run.
T8 (mid). Results (board 7) incl. ghost line, verdict, seed copy/paste, share card.
Done-when: screenshot for a forced-seed run; pasted seed reproduces the schedule.
T9 (low). Docs: "82:0 Challenge" section in `docs/game_mechanics.md`, `AGENTS.md` repo map
and commands, `ARCHITECTURE.md`; PNG exports of the signed boards into the design folder.

## Parallelization

Wave 0 (driver, top): T1 then T2. Wave 1 (parallel): T3, T4, T5 (disjoint files, need T2's
types only). Wave 2 (parallel): T6 and T7 (both need T2+T4; T7 needs T3). Wave 3: T8.
Wave 4 (low): T9. Agents never run git; the driver verifies and commits each wave.

## Recommended model tier

Main driver: top (Fable 5.1 / Opus 5) — owns T1/T2 (new balance constants) and reviews
every wave against the boards. T3 and T6 top (advice ranking, reveal timing); T4, T5, T7,
T8 mid (Sonnet 5); T9 low (Haiku 4.5).

## Verification / exit criteria

- `npm test` green incl. `challenge.test.ts`, advice tests, storage round-trip; tsc, lint,
  `check:styles` clean; `npm run balance -- 500 --seed 42` before/after identical (quote PPP).
- T1 distribution table quoted here with the chosen `CHALLENGE_TUNING`.
- Screenshots per task compared against the signed boards; owner verifies live in the
  local browser (design-first workflow) before the plan closes.
- One full dev playthrough per draft style: start page -> draft -> deck builder -> first
  spin -> front office (edit lineup, make the trade) -> second spin -> results; reload at
  each phase keeps `phase`, results and `trade`; a tournament roster cannot enter `/challenge`.
