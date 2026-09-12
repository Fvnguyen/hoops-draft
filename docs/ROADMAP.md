# Magic Ball — Code Review and Roadmap

Date: 2026-09-12. Scope: full read of `frontend/src/lib/*`, `hooks/`, API routes, page shells, component data flow; lint and production build run; ratings statistics from `data/computed_cards.json`; play/synergy activation checked against the latest season dump in `data/game_logs/`.

Mid-term goal this plan targets: mobile-friendly PWA (later an Android listing), a real database for user state, hosted on Vercel.

---

## 1. Verdict on the stack

**Keep Next.js 16 (App Router) + React 19 + Tailwind 4.** It is the right shape for the goal:

- The game engine is pure TypeScript and already runs client-side, which is exactly what an offline-capable PWA needs.
- Next.js gives a manifest, service worker integration, API routes for later cloud saves, and a first-class Vercel deploy.
- The UI is DOM/CSS heavy (3D card flips, framer-motion, Tailwind). A React Native / Expo rewrite would throw all of that away for little gain; a PWA wrapped as a Trusted Web Activity (TWA) gets a Play Store listing with no rewrite.

What is *not* right today is how the app is wired, not the frameworks:

| Problem | Why it blocks the goal |
|---|---|
| Player data is read from `frontend/game.db` at request time via `better-sqlite3`, resolved from `process.cwd()` | Native module plus a file path that does not exist in a Vercel function. Every deploy story starts by removing this. |
| All user state lives in `localStorage` as huge JSON blobs (one 7-game season ≈ 1.7 MB) | Hits the ~5 MB quota after a few seasons, cannot sync across devices, and there is no `try/catch` around the writes. |
| Domain types live in a UI component (`components/PlayerCard.tsx`) and `lib/*` imports from `components/` | The engine cannot be tested, benchmarked, or reused without React. |
| `Math.random()` is called directly in 24 places in the engine | Games are not reproducible; tests cannot pin behaviour; persistence must store full play-by-play instead of a seed. |
| Layouts are desktop-fixed (`w-[320px]`, `w-[450px]`, `max-w-[1500px]`, 5-column draft grid); 16 responsive classes in ~2,600 lines of components; no `viewport` export | Nothing is usable on a phone yet. |

---

## 2. Bugs found (verified)

Severity: **P0** wrong game results, **P1** data loss or broken feature, **P2** correctness/perf, **P3** hygiene.

### P0-1 — Every defensive synergy and play *helps* the opponent
`synergies.ts` stores defensive effects as **negative** efficiency deltas ("reduce opponent rim eff" → `rimEffBonus: -0.005`), and `gameEngine.ts:507-509` then **subtracts** the opponent's `defenseMods`:

```ts
channelEffBonus = offenseMods.rimEffBonus - (defenseFromOpponent.rimEffBonus || 0)
// -(-0.02) = +0.02 for the *offense*
```

Affected: Lockdown Squad, Rim Protection, Two-Way Terror, Two-Way Wings, Grit and Grind, Zone Defense. Zone Defense at full activation gives the opponent **+3% 3pt efficiency**. This directly inflates points per possession (see the analytics summary's 1.29 PPP finding).

Fix: pick one convention and document it. Simplest: treat `defenseMods` as deltas applied *to the opponent's offense* and change lines 507-509 (and the share lines 435-437 for consistency) to `+`. Add a test: "with Zone Defense active, opponent 3pt efficiency is lower than without".

### P0-2 — Play cards never activate
`draftEngine.ts:82` gives each play card in a pack a unique React key by rewriting its id: `` `${randomPlay.id}_pack${p}` ``. Nothing ever strips that suffix, and `synergies.ts:344` looks up `PLAY_EFFECTS[play.id]`. The lookup always misses, so `checkPlayActivation` returns `null` and every play reports "Requirements not met".

Evidence: the newest season dump (`season_season_1789232940223.json`) contains 30 play entries, all `"activated": "none"`. The 64.7% High Pick & Roll number in the analytics summary predates this id scheme.

Fix: keep `id` for React keys but add `playId` (base id) to the `Play` type and look up by that; or `PLAY_EFFECTS[play.id.split('_pack')[0]]` as a one-line hotfix. Add a test that a roster meeting High PnR requirements gets `activated: 'full'`.

### P0-3 — Offensive play possession bonuses are dropped; defensive ones double-count
`synergies.ts:426-431`: only the defensive-play branch adds `result.possessionSwing` to the team-level `possessionSwing`. 7 Seconds or Less and Motion Offense ("+1 poss") go into `offenseMods.possessionSwing`, which `calcPossessionSplit` never reads. Meanwhile Grit and Grind's +1 is added to the team's own possessions *and* subtracted from the opponent's (`gameEngine.ts:296-301`), so it is worth 2.

Fix: one accumulator, applied once. (Moot once P0-1's convention is settled; fix them together.)

### P1-1 — Structural offense > defense rating gap gives every offense a permanent edge
From `data/computed_cards.json` (448 players):

| Rating | Mean |
|---|---|
| finishing | 55.5 |
| postDefense | 46.4 |
| perimeter | 57.5 |
| perimeterDefense | 53.5 |

Mean rim edge is +0.09, 3pt edge +0.04, so with `EFFICIENCY_SCALE = 0.30` the *average* lineup shoots +2.7 pp at the rim against the *average* defense. This is the mechanism behind the user's hypothesis that "edge always rewards the same team": edge is deterministic per lineup pair, and it is positive for almost everyone. Combined with P0-1 it explains the 1.29 PPP.

Fix: centre the edge on league means computed once from the card pool: `edge = (off - leagueAvgOff[ch]) - (def - leagueAvgDef[ch])`. Alternatively rescale defense ratings in `engine.ts` so each channel's offense and defense distributions share a mean. Re-tune `EFFICIENCY_SCALE` afterwards with the headless balance script (section 4).

### P1-2 — localStorage quota will be exceeded and the failure is silent
`saveSeason` (`seasonEngine.ts:147-153`) and `saveDraftSession` (`botDeckBuilder.ts:146-172`) write whole objects with no `try/catch`. One season stores seven full `GameTheater`s (≈200 narrated possessions each) ≈ 1.7 MB pretty-printed; the latest full export was 11.8 MB. Browsers cap `localStorage` around 5 MB per origin. When `QuotaExceededError` throws inside the "play next game" handler the result is lost and the UI shows nothing.

Fix now: move to IndexedDB (Dexie or idb-keyval) behind a small storage interface. Fix properly: persist `seed + inputs + box score`, not the narrated possessions, once the RNG is injectable (section 3).

### P2-1 — `/api/cards` does ~900 SQL queries per request and is called by three pages
`engine.ts` `getAllCards()`: loads all `SeasonStat` rows once (used only for `min()`), then inside the per-player map runs two prepared statements per player (448 × 2). Nothing is cached; DraftRoom, deckbuilder-test and the data page each fetch it. Fix: compute once (module-level memo) or, better, precompute at build time (section 3).

### P2-2 — Box score minutes are half of real, turnovers are never counted
`gameEngine.ts:888` adds 0.24 min per *offensive* possession only (OT at 982 adds 0.48). A full-time starter ends around 24 minutes. `turnovers` is initialised at 812 and never incremented, so the "turnover rate" the analysis script reports is just narrative text frequency, as the user already noted.

### P2-3 — Biased shuffle
`draftEngine.ts:48` and `:66` shuffle with `sort(() => Math.random() - 0.5)`, which is not uniform. `seasonEngine.ts:51-54` already has a Fisher-Yates; reuse it.

### P2-4 — Efficiency index and benchmark use different volume thresholds
`engine.ts` builds the mid/3pt efficiency benchmarks from players with ≥ 2.0 attempts, but indexes players with ≥ 1.0 attempts against them. Low-volume shooters are graded against a benchmark they were excluded from. Minor, but it is the kind of thing that makes rarity distributions skew.

### P2-5 — Position data collapses PG/SG/SF/PF
`game.db` positions: G 176, F 130, C 47, G/F 44, F/C 42, and only 9 players with PG/SG/SF/PF. The `nba_api` bio positions overwrite basketball-reference's granular ones in `data/fetch_players.py`. Consequences: five of the ten OVR weight profiles in `RATING_CONFIG.ovr.PROFILES` are effectively unused, and depth-chart eligibility treats every guard as PG-or-SG. Fix in the pipeline: keep bref `Pos` as primary, nba_api as fallback.

### P2-6 — `/api/game-logs` writes arbitrary request bodies to disk with no auth
Fine as a local dev tool, not something to deploy. Guard with `process.env.NODE_ENV !== 'production'` (return 404) or delete before hosting. On Vercel the filesystem is read-only anyway, so it would 500.

### P3 — Hygiene
- `npm run lint`: **115 errors, 43 warnings** (mostly `no-explicit-any` in `engine.ts` and components, unused imports, `prefer-const`). Build does not lint in Next 16, so this only bites once CI exists. Three are auto-fixable.
- Dead code: `generatePack`, `calcPlaystyleShift`, `RotationSlot`, unused `totalPossessions` param on `calcPossessionShares`, `_debug`, `PACK_SIZE`.
- `useDraftEngine.ts:22-25` effect has missing deps; under React StrictMode the cube pool is generated twice on mount (harmless, wasteful).
- `next build` warns about two lockfiles (root and `frontend/`). Set `outputFileTracingRoot` in `next.config.ts` or drop the root lockfile.
- Position strings mix `-` and `/` (`'G-F'` checks in `gameEngine.ts:699` are dead since the data uses `/`).
- The node tests in `tests/` re-implement engine logic inline instead of importing it. That is why P0-1 and P0-2 exist while "39 tests pass". They test the mirror, not the engine.
- Home-court advantage does not exist in the engine (home teams 48.6%). Decide whether that is intended.
- Bot draft value is `PER × 10` only (`draftEngine.ts:125`); OVR and rarity are ignored, so bots undervalue what the card system says is good.

---

## 3. Architecture proposals

### A. Isolate the engine
Create `frontend/src/engine/` (or a workspace package `packages/engine`) containing `types.ts`, `ratings.ts` (from `engine.ts`), `draft.ts`, `deckbuilder.ts`, `game.ts`, `season.ts`, `synergies.ts`, `balance.ts`, `rng.ts`. Rules: no React, no Next, no `fs`, no DOM. Move `Player`, `Play`, `DraftCard`, `PlayerCard` out of `components/PlayerCard.tsx` into `engine/types.ts`; components import from the engine, never the reverse.

Inject randomness: `simulateGame(home, away, rng)` / `generateCubePool(players, plays, rng)` with a tiny seeded PRNG (mulberry32). Store the seed with each game and draft. Payoffs: deterministic tests, replayable games, and persistence that stores kilobytes instead of megabytes.

Put every tuning constant in `engine/balance.ts` (`NBA_BASELINE`, `EFFICIENCY_SCALE`, `MAX_EFF_SHIFT`, `PROFILE_WEIGHT`, `AND1_BASE`, `STRENGTH_SWING_PCT`, `NOISE_PCT`, `RATING_CONFIG`, synergy and play numbers). Balance work becomes one-file edits.

### B. Player data becomes a static build artifact
Player data is a per-season snapshot; it does not need a runtime database. Add `scripts/build-cards.ts` that runs the rating code against the pipeline output and writes `frontend/src/data/cards.2025-26.json` (or `public/cards.json`). `/api/cards` becomes a static import or goes away. Remove `better-sqlite3` and `game.db` from the app. This single change makes Vercel, offline PWA, and a static export for Capacitor all work, and deletes the `process.cwd()` gotcha.

Keep SQLite only inside `data/` as a pipeline intermediate, or have `fetch_players.py` emit JSON directly and drop it.

### C. One persistence layer, two backends
`frontend/src/storage/` with an interface:

```ts
interface GameStore {
  listDraftSessions(): Promise<DraftSessionSummary[]>;
  getDraftSession(id): Promise<DraftSession | null>;
  saveDraftSession(s): Promise<void>;
  saveRoster(r): Promise<void>;   // today: 'myRosters'
  saveSeason(s): Promise<void>;
  ...
}
```

Implementation 1: IndexedDB via Dexie (replaces the six scattered `localStorage` call sites in `debug/`, `rosters/`, `deckbuilder-test/`, `DeckBuilder.tsx`, `botDeckBuilder.ts`, `seasonEngine.ts`). Implementation 2, later: remote (section E) with the IndexedDB copy as an offline cache. Components never touch storage directly; a Zustand store (or React context) holds in-memory game state.

### D. Mobile-first UI
- Add `export const viewport` in `app/layout.tsx`; audit every `w-[Npx]` and `grid-cols-5`.
- Cards: make `PlayerCard` scale with its container (Tailwind 4 `@container` queries) instead of fixed 300 px / 140 px wrappers.
- Draft room on phones: one pack as a swipeable carousel, pick confirm as a bottom sheet.
- Deck builder: drag-and-drop is poor on touch. Add tap-to-select then tap-a-slot; keep DnD on pointer devices.
- Game view: play-by-play list virtualised (200+ rows), score header sticky.
- Navigation: bottom tab bar on small screens, `TopNav` on desktop.
- Test with Playwright's mobile device presets; add one visual snapshot per screen at 390 px width.

### E. The "actual DB"
What needs a database is **user state**: accounts, saved drafts, rosters, seasons, later leaderboards. Recommendation: **Supabase** (Postgres + Auth + row-level security, generous free tier, client SDK works from a PWA, realtime if you ever want async multiplayer). If you want to stay inside Vercel's marketplace, Neon Postgres + Drizzle + Auth.js is the equivalent.

Schema sketch: `users`, `draft_sessions(id, user_id, seed, pick_log jsonb, seats jsonb)`, `rosters(id, session_id, depth_chart jsonb, active_plays text[])`, `seasons(id, roster_id, schedule jsonb)`, `games(id, season_id, seed, home_roster_id, away_roster_id, final_score, box_score jsonb)`. With injected RNG a game row is the seed plus inputs; the theater is recomputed on demand.

### F. Hosting on Vercel
After B and C: `vercel` deploy just works. Delete or guard `/api/game-logs`; set `outputFileTracingRoot`. Preview deployments per branch give you the mobile test URL you need for real devices.

### G. PWA, then Android
1. PWA: `app/manifest.ts`, icons, `@serwist/next` for the service worker (precache the app shell, cards JSON, headshots on demand), an offline fallback page. Target a passing Lighthouse PWA audit.
2. Android: **Bubblewrap / Trusted Web Activity** first. It publishes the hosted PWA to the Play Store with zero app code; requires HTTPS (Vercel) and a `assetlinks.json`. Move to **Capacitor** only if you need native APIs (push, haptics, IAP). Capacitor needs either a static export (`output: 'export'`, possible once B removes server routes) or a remote URL.

### H. Testing and balance tooling
- Vitest for the engine, importing the real modules with a fixed seed. Replace the two inline-mirror node tests.
- Property-style checks: PPP within a band over 1,000 seeded games; defensive synergies lower opponent efficiency; play activation for a roster that meets requirements; cube pool has 264 unique players.
- `npm run balance`: simulate N games headlessly in Node using the isolated engine and print the same report `scripts/analyze_game_data.js` prints today. This replaces the play → `/debug` → export → analyze loop and makes tuning a 10-second feedback cycle.

### I. Data pipeline
Keep the Python/Playwright scraper as offline tooling. Version outputs by season (`data/seasons/2025-26/`), keep bref positions (fixes P2-5), and make the output the single JSON that `build-cards.ts` consumes.

---

## 4. Quick wins (each well under a day)

1. Fix P0-1, P0-2, P0-3 in `synergies.ts` / `gameEngine.ts` (a handful of lines) and re-run the analysis; PPP should drop noticeably.
2. Centre channel edges on league means (P1-1), then re-tune `EFFICIENCY_SCALE`.
3. Wrap storage writes in `try/catch` and surface a toast on quota errors (stopgap for P1-2 until IndexedDB lands).
4. Memoise `getAllCards()` and batch the SQL into three queries (P2-1).
5. Fisher-Yates shuffle (P2-3); minutes ×2 and real turnover accounting or drop the column (P2-2).
6. `npm run lint -- --fix`, type the `any`s in `engine.ts` (the interfaces already exist), delete dead code, add lint to CI.
7. Guard `/api/game-logs` to non-production.
8. Add `viewport` metadata and a responsive pass on the home page (the only page with mock data, so it is the cheapest to make mobile-clean first).
9. Vitest harness that imports the real engine with a seeded RNG, replacing `tests/test_game_engine.js`.
10. `outputFileTracingRoot` in `next.config.ts` to silence the multi-lockfile warning.

---

## 5. Phased plan

| Phase | Scope | Rough effort | Exit criterion |
|---|---|---|---|
| 0. Correctness | Quick wins 1-7, 9, 10 | 1-2 days | Defensive plays reduce opponent efficiency in a test; plays activate; PPP in a realistic band in `npm run balance` |
| 1. Engine isolation | Proposals A, B, C (IndexedDB backend), H | 3-5 days | `frontend/src/engine` has no React/Next imports; cards are a build artifact; `better-sqlite3` removed; first Vercel preview deploy |
| 2. Mobile + PWA | D, G.1 | 1-2 weeks | Every screen usable at 390 px; Lighthouse PWA audit passes; installable on a phone from the Vercel URL |
| 3. Accounts + cloud saves | E, C (remote backend), F hardening | ~1 week | Sign in, drafts/rosters/seasons sync across devices, offline still works |
| 4. Android | G.2 (TWA) | 2-3 days | Play Store internal-test listing |
| 5. Balance and content | Re-tune synergies/plays with the headless harness; bot draft valuation using OVR; home-court decision; new season data | ongoing | Analytics flags green |

Phases 0 and 1 are prerequisites for everything else; 2 and 3 can run in parallel once 1 is done.

---

## 6. Where to look

| Item | File |
|---|---|
| Defensive modifier sign bug | `frontend/src/lib/gameEngine.ts:507-509`, `frontend/src/lib/synergies.ts:396-438` |
| Play id suffix bug | `frontend/src/lib/draftEngine.ts:82`, `frontend/src/lib/synergies.ts:344` |
| Possession swing accounting | `frontend/src/lib/synergies.ts:426-431`, `frontend/src/lib/gameEngine.ts:296-301` |
| Rating scale gap | `frontend/src/lib/engine.ts` (`RATING_CONFIG.defense`, `getIndex`), `data/computed_cards.json` |
| localStorage writes | `frontend/src/lib/seasonEngine.ts:147`, `frontend/src/lib/botDeckBuilder.ts:146`, `frontend/src/components/DeckBuilder.tsx:361-366` |
| N+1 queries | `frontend/src/lib/engine.ts` `getAllCards()` |
| Position data loss | `data/fetch_players.py` (bio merge), `frontend/game.db` `Player.position` |
