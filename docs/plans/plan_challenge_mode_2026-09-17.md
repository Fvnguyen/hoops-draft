# Plan: challenge_mode

File: `docs/plans/plan_challenge_mode_2026-09-17.md`. Status: in progress, Wave 0 done.
Sequence: 9 in `docs/ROADMAP.md`. Depends on: none. Design: canvas "82:0 Challenge Mode"
https://claude.ai/artifact/P7XLqF4kogeY7kvu4h4X7W, sources in `docs/design/challenge_mode/`
(boards 1a-1c, 2-7 signed; `Main` is backlog, not this plan).

## Goal

A second game mode modelled on the viral "82-0" browser games: pick it on the start
page, draft and build as usual, then one 82-game season against all 30 real NBA rosters, shown
as a slot-machine flip clock in two spins with a trade deadline and lineup reset between them
and one final grade. Four minutes, no single-game screens, no narration. The 7-game mode is
renamed "In-Season Tournament", otherwise untouched.

## Decisions (locked)

D1. **Mode is chosen before the draft.** Start page (board 1a): primary buttons "In-Season
    Tournament" (cream) and "82:0 Challenge" (dark, gold) replace Premier/Quick; clicking one
    dims the other and opens two hovering option cards, Premier vs Quick Draft (1b cream, 1c
    dark; clock-ring motif amber vs chevron blue). Route `/draft?mode=premier|quick&game=
    tournament|challenge`; `DraftSession.gameMode?: 'tournament' | 'challenge'` (missing =
    tournament). The deck builder's save CTA routes by `gameMode` ("Save & play season" /
    "Save & start 82:0" -> `/challenge/[rosterId]`); no post-draft choice, and a roster can
    only start the mode it was drafted for.
D2. **Theme and chrome** (amended 2026-09-17 after the live review). Challenge routes are
    dark via `data-theme="night"` on the subtree, NOT the literal `surface-inverse-deep`
    first written here: under night the ordinary tokens already resolve to the signed
    boards' palette, while the inverse tokens give the court theme's amber. Components stay
    theme-agnostic. Tournament stays cream. Draft room and deck builder are NOT re-themed;
    a gold "82:0" header badge marks a challenge session. Rename scope: home button and
    SeasonView title. `/challenge` is a GAME route, not a bare one — a 4-minute run needs
    the gear menu's confirm-then-Home; the challenge headers reserve `pr-nav-gear` so their
    own controls clear it.
D3. **Opponents.** Pure `buildNbaTeamRoster(cards, teamAbbr)`: top 15 by OVR on `player.team`
    into `buildBotRoster` with the full play catalog (best 3 staffable plays +
    `chooseBotArchetypes`), trimmed to 12; any empty depth-chart slot is backfilled regardless
    of position (MEM is the one team that hits this). Fix `PHX/CHA/BKN` vs `PHO/CHO/BRK` in
    `cardColors.ts` first. NBA rosters are LOCKED IN (owner, 2026-09-17): a drafted Luka faces
    Lakers Luka, so `simulateGame` keys box stats by side + id.
D4. **Schedule and seeds.** 30 teams shuffled by the run seed, sequence repeated 3x, first
    82 taken; user is home on even indices. Every game's seed is derived from
    (run seed, game index) and the trade pack from (run seed, 'trade'), never from a shared
    stream, so reloads, speeds and skips cannot shift results. All 82 games always play.
D5. **Difficulty: challenge-only steepness.** Challenge games pass
    `CHALLENGE_TUNING: EdgeTuning` (`efficiencyScale`/`maxEffShift`) to `simulateGame`;
    the engine and tournament balance are untouched. Target: the best drafted seat's top
    decile reaches A+ (72+), S is rare. **Chosen in T1: `{ efficiencyScale: 0.50,
    maxEffShift: 0.20 }`** (engine default is 0.20/0.08) — table below.
D6. **Grades** (reference-game ladder with +/-): S+ 82 Immortal; S 80-81 Perfect; A+ 72-79
    Historic; A 66-71 / A- 62-65 Dynasty; B+ 61 / B 59-60 / B- 57-58 Contender; C+ 55-56 /
    C 52-54 / C- 50-51 Playoff; D+ 47-49 / D 43-46 / D- 40-42 Lottery; F 0-39 Tanking.
D7. **The reveal is presentation over a finished sim.** `simulateHalf` runs 41 games in one
    call, committed before the animation starts; reloading replays it. Flip clock W:L (boards
    2, 3, 6): slow and readable for the first week, accelerating until the flaps blur, sealed
    through the break, readable again for the last five at locked speed. Speeds Slower /
    Normal / Instant; tap skips to the next stop. Progress bar never coloured by result;
    streak call-outs (10/25/41/60/82) are the only mid-reel result signal.
D8. **Front office (board 4), once, after game 41.** A pace band on the tier ladder
    (projected wins 2x first-half +/- 7, snapped outward to grade bands), never the record.
    Three quotes, Coach / Owner / Fans, from pure `engine/challengeAdvice.ts`: a ranked reason
    catalogue over first-half data (weakest four-factor either side vs league, bench player
    out-producing a starter, worst rotation plus-minus, unstaffed or failing play, identity one
    step from online, pace band) -> each reason carries an action chip (Lineup / Plays / Trade
    / Hold), an evidence line, and 3-4 templates per speaker; a band starting at Historic
    yields Hold quotes. Never OVR or ratings, never W-L. Actions: adjust lineup, plays and
    identity, one optional trade, "Spin the second half".
D9. **Trade (board 5).** Drop one roster card; five offers drawn without replacement from all
    448 cards minus the user's, weights per RARITY CLASS `{Common 55, Uncommon 30, Rare 12,
    Mythic 3}` with the dropped card's class x4, renormalised (per-card weighting instead
    buries Mythic at 1.5%). The pick goes to the bench; offers matching a quote's reason get
    an "Answers the coach/owner/fans" tag. `PackOpener variant="trade"` = gold trim.
D10. **Results (board 7).** Grade slam + title, record on the same flaps, win trend line
    (games above .500), dashed ghost line from game 41 = the same seeds with the pre-trade
    roster, trade verdict tile (+/- wins, ghost grade), longest streak, season MVP by season
    averages, seed chip + copy, share card panel, "Season stats", "Draft a new team". No game
    log, no per-game drill-in.
D11. **Storage.** New `ChallengeRun`: `id, ownerId, sessionId, rosterId, timestamp, seed,
    balanceVersion, phase ('first'|'break'|'second'|'done'), rosterPre, rosterPost?, trade?,
    halves[] (W/L string, scores, top performer, player totals, opponent totals), ghost?`. No
    box scores. Own store methods and Dexie table; Supabase copies the Season pattern, one
    merge rule: the later `phase` wins. `rosterPre/Post` are snapshots — a trade never mutates
    the saved roster.

## Out of scope

League-wide standings, playoffs, more than one trade, permadeath, re-theming draft room or deck
builder, renaming beyond D2, phone boards (compact pass after desktop lands), mode-specific
draft rules and the limited-style picker (backlog `Main`), per-team playbooks, new pack art.

## Tasks

T1 (top). DONE. `npm run challenge [drafts] [--seed N] [--sweep]`.
T2 (top). DONE: `engine/challenge.ts`, `balance.ts` constants, the `cardColors.ts` fix, and
`engine/plays.ts` (the catalog left `DraftRoom.tsx` for a pure module). 28 tests.
T3 (top). DONE. `engine/challengeAdvice.ts` + `src/narration/challenge/`; 28 tests incl. the
no-rating/no-record scan. Defensive four factors via `opponentTotals`.
T4 (mid). DONE. `ChallengeRun` in all four backends, Dexie 3 -> 4, `mergeChallengeRun`.
Migration `202609170001_challenge_runs.sql` APPLIED to the live project 2026-09-17.
T5 (mid). DONE. Start page, `HomeModePicker`, `gameMode` draft -> session -> roster -> CTA,
82:0 badge, SeasonView title; Button gained a `stacked` size (the primitive had no multi-line
CTA height). Verified live against 1a-1c. "Enter a seed" is still disabled — `parseSeed` (T8)
is what it needs; wiring it belongs to `mode_picker`.
T6 (top). DONE. FlipClock, TierLadder (families derived from `CHALLENGE_GRADES`),
ChallengeReel, the phase machine, and `/challenge/preview` — boards 2/3/6 with no auth or
storage. Verified at 1280x720.
T7 (mid). DONE. FrontOffice + Trade; lineup/plays reuse the whole DeckBuilder via
`embedOverride`, so edits write `rosterPost`, never the drafted roster. Confirming a trade now
opens the lineup editor (the acquired card lands on the bench per D9, so trade-then-spin used
to play 42-82 with eleven). The trade pack uses its own art; the "Answers the X" tag is cut —
it fired on all five offers, so it said nothing.
T8 (mid). DONE. `Results.tsx` + the ghost half + `/challenge/preview-results` (the sign-off
route, no auth or storage). The seed chip copies the code it displays and `parseSeed` inverts
it; the code is 7 base36 chars because 6 truncates a 32-bit seed into a different season.
T9 (low). Docs: "82:0 Challenge" in `game_mechanics.md`, `AGENTS.md`, `ARCHITECTURE.md`.

## T1 calibration (measured 2026-09-17)

`npm run challenge 40 --seed 42 --sweep`; "best seat" = best starter-five OVR of the eight.

| effScale / maxShift | all mean | best median | best p90 | best A+ | best S |
|---|---|---|---|---|---|
| 0.20 / 0.08 (engine default) | 44.9 | 57 | 65 | 0.0% | 0% |
| **0.50 / 0.20 (chosen)** | **47.8** | **63** | **72** | **12.5%** | **0%** |

Confirmation, `npm run challenge 250 --seed 7` (2,000 seat-seasons), re-run identical after the
box-score fix: best seat mean 60.0, median 60, p90 70, max 78, A+ 8.8%, S 0/250; wins fall
monotonically by seat rank (#1 60.0 -> #8 32.3), so the draft decides the run. The top decile
lands at 70 not 72 and S never appeared, but both were measured WITHOUT the front office, which
only adds wins — so 0.50/0.20 stands, to be re-measured with the trade in place.

## Parallelization

Waves 0-3 DONE (T1-T8). Wave 4: T9. Agents never run git; the driver verifies, re-checks
against the boards in a browser, and commits.

## Recommended model tier

Main driver: top — owns T1/T2, reviews every wave against the boards. T3/T6 top; T4/T5/T7/T8 mid; T9 low.

## Verification / exit criteria

- `npm test` green; tsc, lint, `check:styles` clean; `npm run balance -- 500 --seed 42`
  before/after identical. After Wave 3: 419/419, 0 errors, 0 violations, PPP 1.044 both sides,
  smoke 9/9 (the missing headshot is fetched; `npm run ensure:headshots` backfills future gaps).
- Screenshots per task compared against the signed boards; owner verifies live in the browser
  (design-first) before the plan closes — `/challenge/preview` needs no draft.
- One full dev playthrough per draft style: start page -> draft -> deck builder -> first spin
  -> front office (edit lineup, trade) -> second spin -> results; a reload at each phase keeps
  `phase`, results and `trade`; a tournament roster cannot enter `/challenge`.
