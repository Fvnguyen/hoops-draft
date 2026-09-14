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
| 3 | mobile_responsive — viewport export, `@container` cards, touch-friendly draft/deckbuilder, sticky game header, bottom nav (proposal D only; no manifest/service worker) | not yet planned | — (2a done, unblocked) | — | 2-3 days |
| 4 | [draft_ai](plans/plan_draft_ai_2026-09-13.md) — bots contest identities; drafts differ by strategy | planned | — (2a done, unblocked) | `engine/draft.ts`, `hooks/useDraftEngine.ts`, `scripts/archetype-feasibility.ts`, `DraftRoom.tsx` (pack play card) | 1-2 days |
| 5 | [card_balance](plans/plan_card_balance_2026-09-13.md) — position data, rarity/badge distribution, play & plan content | planned | 4 (game_engine done; needs contested-draft data) | `data/fetch_players.py`, `engine/ratings.ts`, `engine/balance.ts` rating section, `engine/playbook.ts` catalog, `engine/archetypes.ts` catalog, `src/data/cards.json` | 2-3 days |
| 6 | [game_theater](plans/plan_game_theater_2026-09-13.md) — structured narration, game-flow beats, playback controls | planned | — (game_engine done, unblocked) | `engine/game.ts` narration, new `src/narration/`, `GameView.tsx` | 2 days |
| 7 | mobile_pwa_shell — manifest, service worker, offline fallback, Lighthouse PWA audit (proposal G.1) | not yet planned | 3 | — | 1-2 days |
| 8 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2) | not yet planned | 7 | — | 2-3 days |

Re-sequenced 2026-09-14: `accounts_cloud_saves` (was #3) is done — see Recently completed.
`ui_draft_deckbuild_pack`, `ui_polish_small_fixes`, `playwright_auth_fixture`,
`game_engine`, and `season_lifecycle_notifications` (was #2b, small/unblocked, inserted
and finished same-day) are done too. card_balance keeps its hard dependency on draft_ai (needs
contested-draft data to measure against) so draft_ai still lands first despite ranking
lower in value. mobile_pwa is split into mobile_responsive (#3, layout only, cheap) and
mobile_pwa_shell (#7, manifest/service worker), so the layout pass isn't gated behind
Android. Scope sketch for 3, 7-8 is proposals D, F, G in
`docs/completed/review_code_and_architecture_2026-09-12.md`; write their plan docs
(`/roadmap new`) when their turn comes.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [season_lifecycle_notifications](completed/plan_season_lifecycle_notifications_2026-09-14.md) | 2026-09-14 | Derived Pre-Season/Live/Completed status, UI-enforced roster/season lock, per-roster records + user W/L stats, notification bell (changelog + season-complete) — all verified live in-browser |
| [accounts_cloud_saves](completed/plan_accounts_cloud_saves_2026-09-14.md) | 2026-09-14 | Supabase-backed `GameStore` (`cas_upsert` optimistic-CAS RPC), type-specific auto-merge (`storage/merge.ts`), roster conflict UI, scoped `/api/analytics`+`/admin/analytics`; two-device merge and conflict paths verified live against production, not just mocks |
| [game_engine](completed/plan_game_engine_2026-09-13.md) | 2026-09-14 | OT/home-court/spread/impact tuning fixed and measured; code review (T6) fixed dead-code lineup wiring; draft-impact + talent-vs-luck decomposition unified into `--report` and the Power Curve artifact |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
