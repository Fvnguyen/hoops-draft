# Magic Ball — Roadmap

This file says **which plans to tackle in which sequence**. It holds no design detail.

## Rules

- Every piece of work bigger than a bug fix has a plan in
  `docs/plans/plan_<topic>_<YYYY-MM-DD>.md` (date = when the plan was written), created
  from `docs/plans/TEMPLATE.md`. A plan has all decisions locked in before work starts,
  a task list with an optional parallelization plan, and a recommended model tier.
- When a plan's exit criteria are met, `git mv` it unchanged to `docs/completed/`, set its
  status line to `done <date>`, update `docs/HANDOVER.md`, and update the tables below.
- The "Recently completed" list shows only the **latest three** plans; older ones stay in
  `docs/completed/` and are found via `ls`, not listed here.
- Sequence is the default order. A plan whose "Depends on" column is satisfied can be
  started early by a second session if it owns disjoint files (each plan lists them).

## Sequence

| # | Plan | Status | Depends on | Files owned (conflicts) | Wall-clock with agents |
|---|---|---|---|---|---|
| 4 | [draft_ai](plans/plan_draft_ai_2026-09-13.md) — bots contest identities; drafts differ by strategy | planned | — (2a done, unblocked) | `engine/draft.ts`, `hooks/useDraftEngine.ts`, `scripts/archetype-feasibility.ts`, `DraftRoom.tsx` (pack play card) | 1-2 days |
| 5 | [card_balance_thresholds](plans/plan_card_balance_thresholds_2026-09-17.md) — re-tune archetype thresholds to draft_ai's D8 bands once bots actually chase a plan (split out of card_balance's T5) | planned | draft_ai | `engine/archetypes.ts` (threshold constants only) | half a day |
| 7 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2). Conditional: only once the installed web app is something the owner would hand to a friend | not yet planned | — (game_canvas done) | — | 2-3 days |
| 8 | phone_card — a wider draft-room card variant for phones so the unused horizontal space carries name + badges (game_canvas D7). Design-first: canvas mock-up at 830x385 and owner sign-off before code | not yet planned | — | `PlayerCard.tsx` (redesigned with per-play badge-emblem faces 2026-09-17 — build the phone variant on that, not the old generic diagram), `PackOpener.tsx`, `DraftRoom.tsx` grid | 1 day |
| 9 | [challenge_mode](plans/plan_challenge_mode_2026-09-17.md) — 82:0 Challenge as a true second mode: picked on the start page before the draft, 82 games vs all 30 NBA rosters revealed as a two-spin flip clock, front office (coach/owner/fan quotes, lineup reset, one trade) at game 41, S+ to F grade. Canvas-signed 2026-09-17 (`docs/design/challenge_mode/`) | planned | — | `engine/challenge.ts` + `engine/challengeAdvice.ts` (new), `engine/balance.ts` additions, `storage/*` (new `ChallengeRun`), `cardColors.ts` (team-abbr fix), `app/page.tsx` (mode buttons + draft-style cards), `useDraftEngine.ts`/`DeckBuilder.tsx`/`rosters/page.tsx` (`gameMode` routing), `app/challenge/[rosterId]/` + `components/challenge/*` (new), `PackOpener.tsx` (`variant="trade"`), `scripts/challenge-sim.ts` (new) | 5-6 days |
| 10 | mode_picker — MtG-Arena-style "limited picker" for game modes, and mode-specific draft rules (backlog board `Main` in `docs/design/challenge_mode/`) | not yet planned | challenge_mode | `app/page.tsx` | — |

**Shipping gate — already crossed (2026-09-17).** `main` was pushed to `origin/main`
(commit `7c89111`) before `card_balance` had fully landed — the 2026-09-16 gate ("wait
for card_balance to land before any push") did not hold. Nothing to revert; `card_balance`
itself closed 2026-09-17 with T1-T4/T6 done, T5 split into `card_balance_thresholds` above.

Re-sequenced 2026-09-15: `ui_foundation` (done that evening) went ahead of
`mobile_responsive` because its tokens and primitives resolve most of the mobile
audit's punch list (absolute-px type/hit-area defects, not breakpoints) in one pass;
mobile T6 then re-audits and fixes only what is left. Earlier that day:
`mobile_responsive` took over the manifest/icons/auto-login work; `mobile_pwa_shell` is removed (a service worker and offline page cannot work while
`proxy.ts` gates every route on a live Supabase session — revisit only with an offline-
tolerant auth design) and `android_twa` (#7) is conditional on the owner wanting to hand the installed app to a friend (`game_canvas` done 2026-09-16). `deckbuilder_ux` (done)
was added after the owner's live review of ui_foundation the same evening: one deck-builder
redesign for all devices, canvas-signed first, absorbing the mobile plan's tap-to-place.
Scope sketch for #7 is proposal G.2 in
`docs/completed/review_code_and_architecture_2026-09-12.md`.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [card_balance](completed/plan_card_balance_2026-09-13.md) | 2026-09-17 | Real bref-primary positions, rarity redistribution (23/55/117/253, on D2's target), badge L1/L2/L3 hand-binning + keystone combo conditions, play catalog 10→14 (4 new plays close 3 previously-uncovered plans), `CARD_SET_VERSION`. 338/338 tests. T5 (threshold re-tune against draft_ai's D8) split into `card_balance_thresholds` — needs draft_ai's contested drafts to mean anything |
| [game_theater](completed/plan_game_theater_2026-09-13.md) | 2026-09-17 (manual override) | Structured `narrative` per event, broadcast-style play-by-play, game-flow beats, crunch time (Q4/OT closing fives, 1x snap + pop-up), full box score with season totals; 333/333 tests, `npm run balance` before/after unchanged. Closed before its own two exit criteria ran (in-app season game, legacy-season load) — T6 (removing `narrativeText`) is still open; commits `be99ef0`..`579ae51` |
| [badge_effects](completed/plan_badge_effects_2026-09-17.md) | 2026-09-17 | Closed without a full plan — its badge-levels-as-content scope shipped inside `card_balance` T2/T3 (rarity mechanism, keystone combo conditions); the originally named "special effects on top of the lineup model" mechanic was not built and is not planned; commits `9e2910d`, `c5c034c`, `58fd82d`, `d96b96f`, `037710d` |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
