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
| 1b | [ui_polish_small_fixes](plans/plan_ui_polish_small_fixes_2026-09-13.md) — drag preview delay, pack-reveal preview suppression, double-click draft pick, identity radar scale | T1/T3/T4 done and live-verified; T2 (pack-reveal preview suppression) has no live preview mechanism to suppress in the current pack grid — owner decision needed (moot vs. new feature) | — | `components/{DeckBuilder,PackOpener,DraftRoom,TopKPIBand,useHoverPreview}.tsx` | done except T2 decision |
| 2 | [game_engine](plans/plan_game_engine_2026-09-13.md) — decisive plays/identities, realistic spread, OT plays, home court | planned | — (unblocked) | `engine/game.ts`, `engine/balance.ts`, `engine/playbook.ts` allocations, `engine/season.ts` | 1-2 days |
| 3 | mobile_responsive — viewport export, `@container` cards, touch-friendly draft/deckbuilder, sticky game header, bottom nav (proposal D only; no manifest/service worker) | not yet planned | — (2a done, unblocked) | — | 2-3 days |
| 4 | [draft_ai](plans/plan_draft_ai_2026-09-13.md) — bots contest identities; drafts differ by strategy | planned | — (2a done, unblocked) | `engine/draft.ts`, `hooks/useDraftEngine.ts`, `scripts/archetype-feasibility.ts`, `DraftRoom.tsx` (pack play card) | 1-2 days |
| 5 | [card_balance](plans/plan_card_balance_2026-09-13.md) — position data, rarity/badge distribution, play & plan content | planned | 2, 4 (measurements must reflect the final sim and contested drafts) | `data/fetch_players.py`, `engine/ratings.ts`, `engine/balance.ts` rating section, `engine/playbook.ts` catalog, `engine/archetypes.ts` catalog, `src/data/cards.json` | 2-3 days |
| 6 | [game_theater](plans/plan_game_theater_2026-09-13.md) — structured narration, game-flow beats, playback controls | planned | 2 | `engine/game.ts` narration, new `src/narration/`, `GameView.tsx` | 2 days |
| 7 | mobile_pwa_shell — manifest, service worker, offline fallback, Lighthouse PWA audit (proposal G.1) | not yet planned | 3 | — | 1-2 days |
| 8 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2) | not yet planned | 7 | — | 2-3 days |
| 9 | accounts_cloud_saves | not yet planned | 7 | — | ~1 week |

Re-sequenced 2026-09-13 per owner priority (mobile layout > game_engine > card_balance >
game_theater > ui_polish > draft_ai > PWA/Android > cloud saves). `ui_draft_deckbuild_pack`
(was #1) is done — see Recently completed. card_balance keeps its hard dependency on
draft_ai (needs contested-draft data to measure against) so draft_ai still lands first
despite ranking lower in value. mobile_pwa is split into mobile_responsive (#3, layout
only, cheap) and mobile_pwa_shell (#7, manifest/service worker), so the layout pass isn't
gated behind accounts/Android. Scope sketch for 3, 7-9 is proposals D, E, F, G in
`docs/completed/review_code_and_architecture_2026-09-12.md`; write their plan docs
(`/roadmap new`) when their turn comes.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [ui_draft_deckbuild_pack](completed/plan_ui_draft_deckbuild_pack_2026-09-13.md) | 2026-09-13 | Draft/deckbuilder pass complete: draft modes, pack ceremony, unified Roster list, empty-start deckbuilder, hover-preview auto-dismiss, quarter-score fix |
| [vercel_deploy](completed/plan_vercel_deploy_2026-09-13.md) | 2026-09-13 | Live on Vercel Hobby (Git-integrated, Root Directory `frontend`); production API/route checks verified |
| [auth_approval](completed/plan_auth_approval_2026-09-13.md) | 2026-09-13 | Supabase email/password + admin approval, username-or-email login, per-user IndexedDB scoping |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
