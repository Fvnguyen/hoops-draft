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
| 3 | [mobile_responsive](plans/plan_mobile_responsive_2026-09-15.md) — landscape-only Samsung phone/tablet layouts, audit-driven punch list, tap-to-place deck builder, Add to Home Screen manifest + auto-login (absorbs the old mobile_pwa_shell; no service worker/offline) | in progress (T1 audit done) | — (ui_foundation, deckbuilder_ux done; T5 absorbed by deckbuilder_ux); T2-T4 may run alongside (disjoint files; `layout.tsx` metadata/viewport exports only) | `playwright.config.ts`, `tests/mobile-audit.spec.ts`, `app/layout.tsx`, `app/manifest.ts`, `OrientationGate.tsx`, `DeckBuilder.tsx`, `DepthSlotColumn.tsx`, `DraftRoom.tsx` (layout only), `GameView.tsx`, `SeasonView.tsx`, `FranchiseDashboard.tsx`, `TopNav.tsx`, `app/page.tsx`, `app/rosters/page.tsx` | 3-4 days |
| 4 | [draft_ai](plans/plan_draft_ai_2026-09-13.md) — bots contest identities; drafts differ by strategy | planned | — (2a done, unblocked) | `engine/draft.ts`, `hooks/useDraftEngine.ts`, `scripts/archetype-feasibility.ts`, `DraftRoom.tsx` (pack play card) | 1-2 days |
| 5 | [card_balance](plans/plan_card_balance_2026-09-13.md) — position data, rarity/badge distribution, play & plan content | planned | 4 (game_engine done; needs contested-draft data) | `data/fetch_players.py`, `engine/ratings.ts`, `engine/balance.ts` rating section, `engine/playbook.ts` catalog, `engine/archetypes.ts` catalog, `src/data/cards.json` | 2-3 days |
| 6 | [game_theater](plans/plan_game_theater_2026-09-13.md) — structured narration, game-flow beats, playback controls | planned | — (game_engine done, unblocked) | `engine/game.ts` narration, new `src/narration/`, `GameView.tsx` | 2 days |
| 7 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2). Conditional: only once #3 is signed off on the real devices and the installed web app is something the owner would hand to a friend | not yet planned | 3 | — | 2-3 days |

Re-sequenced 2026-09-15: `ui_foundation` (done that evening) went ahead of
`mobile_responsive` because its tokens and primitives resolve most of the mobile
audit's punch list (absolute-px type/hit-area defects, not breakpoints) in one pass;
mobile T6 then re-audits and fixes only what is left. Earlier that day:
`mobile_responsive` took over the manifest/icons/auto-login work; `mobile_pwa_shell` is removed (a service worker and offline page cannot work while
`proxy.ts` gates every route on a live Supabase session — revisit only with an offline-
tolerant auth design) and `android_twa` (#7) is conditional on #3's real-device sign-off. `deckbuilder_ux` (done)
was added after the owner's live review of ui_foundation the same evening: one deck-builder
redesign for all devices, canvas-signed first, absorbing the mobile plan's tap-to-place.
The 2026-09-14 note still holds: card_balance keeps its hard dependency on draft_ai (needs
contested-draft data), so draft_ai lands before card_balance despite ranking lower in
value. Scope sketch for #7 is proposal G.2 in
`docs/completed/review_code_and_architecture_2026-09-12.md`.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [deckbuilder_ux](completed/plan_deckbuilder_ux_2026-09-15.md) | 2026-09-15 | Design-first (8 signed artboards): 56px HUD band with overlay report, plays + roster as dockable sidebars, depth chart per artboard with 148px column floor, play tiles, click-to-assign through pure engine helpers; `deckbuilder.spec` at 3 tiers; mobile audit deck-builder 0/0; commits `9f036b3`..`237afff` |
| [ui_foundation](completed/plan_ui_foundation_2026-09-15.md) | 2026-09-15 | Semantic tokens + `data-theme` (court/night), five `components/ui` primitives, blocking style gate 1,358 -> 0, 12px/44px floors, dvh; header never reflows, gear menu on game routes, one confirm dock, pack-pass flicker fixed; mobile audit phone 200 -> 2, tablet 201 -> 0; commits `68b3096`..`695d5dc` |
| [season_lifecycle_notifications](completed/plan_season_lifecycle_notifications_2026-09-14.md) | 2026-09-14 | Derived Pre-Season/Live/Completed status, UI-enforced roster/season lock, per-roster records + user W/L stats, notification bell (changelog + season-complete) — all verified live in-browser |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
