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
| 2a | [ui_draft_deckbuild_pack](plans/plan_ui_draft_deckbuild_pack_2026-09-13.md) — quick/premier draft modes, timed picks, pack ceremony every round, click-first deck builder | in progress (wave 0 paused) | — (lands before 3) | `components/{PackOpener,DraftRoom,DraftSidebar,DeckBuilder,PlayPanel,TopKPIBand,PlayerCard}.tsx`, `hooks/useDraftEngine.ts`, `app/{page,draft,roster,rosters}` | 1.5-2 days |
| 2b | [vercel_deploy](plans/plan_vercel_deploy_2026-09-13.md) — online Vercel serving with preview/prod smoke checks and cost guardrails | planned | 2a | `vercel.json` (if needed), deployment docs, `README.md`, `docs/HANDOVER.md` | 0.5-1 day |
| 2 | [game_engine](plans/plan_game_engine_2026-09-13.md) — decisive plays/identities, realistic spread, OT plays, home court | planned | — (unblocked) | `engine/game.ts`, `engine/balance.ts`, `engine/playbook.ts` allocations, `engine/season.ts` | 1-2 days |
| 3 | [draft_ai](plans/plan_draft_ai_2026-09-13.md) — bots contest identities; drafts differ by strategy | planned | 2a | `engine/draft.ts`, `hooks/useDraftEngine.ts`, `scripts/archetype-feasibility.ts`, `DraftRoom.tsx` (pack play card) | 1-2 days |
| 4 | [card_balance](plans/plan_card_balance_2026-09-13.md) — position data, rarity/badge distribution, play & plan content | planned | 2, 3 | `data/fetch_players.py`, `engine/ratings.ts`, `engine/balance.ts` rating section, `engine/playbook.ts` catalog, `engine/archetypes.ts` catalog, `src/data/cards.json` | 2-3 days |
| 5 | [game_theater](plans/plan_game_theater_2026-09-13.md) — structured narration, game-flow beats, playback controls | planned | 2 | `engine/game.ts` narration, new `src/narration/`, `GameView.tsx` | 2 days |
| 7 | mobile_pwa | not yet planned | 2-5 | — | 1-2 weeks |
| 8 | accounts_cloud_saves | not yet planned | 7 | — | ~1 week |
| 9 | android_twa | not yet planned | 8 | — | 2-3 days |

Plans 7-9 keep the order agreed on 2026-09-12 (game design settles before the mobile UI is
built once). Their scope sketch is proposals D, E, F, G in
`docs/completed/review_code_and_architecture_2026-09-12.md`; write their plan docs when
plan 6 is done.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [data_storage](completed/plan_data_storage_2026-09-13.md) | 2026-09-13 | Slim per-game `StoredGameResult` + re-simulate-on-view, Dexie schema v2, export/import, cardSetVersion tag |
| [analytics_tooling](completed/plan_analytics_tooling_2026-09-13.md) | 2026-09-13 | `analyze.ts` replaces the old JS analyzer, `balance.ts --ab` identity/play-impact harness |
| [stability_pass](completed/plan_stability_pass_2026-09-13.md) | 2026-09-13 | CI, error boundary, safe loads, seeded bots, lint clean (0 errors), smoke spec |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
