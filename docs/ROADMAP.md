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
| 7 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2). Conditional: only once the installed web app is something the owner would hand to a friend | not yet planned | — (game_canvas done) | — | 2-3 days |
| 10 | mode_picker — MtG-Arena-style "limited picker" for game modes, mode-specific draft rules (backlog board `Main`), and wiring the start page's disabled "Enter a seed" to `parseSeed` | not yet planned | challenge_mode | `app/page.tsx`, `HomeModePicker.tsx` | — |
| 11 | [mobile_load](plans/plan_mobile_load_2026-09-21.md) — phone/PWA load: `cards.json` out of every route's JS, 96/480px headshot thumbs, re-encoded hero/pack art + cache headers, lean proxy matcher, PNG icons, back-guard fix, asset-only service worker last (from the 2026-09-21 review) | planned | — (sync_outbox done, T7 unblocked) | `next.config.ts`, `proxy.ts`, `manifest.ts`, `ensure-headshots.mjs`, avatar call sites, `useAndroidBackGuard.ts`, `public/` art | 2-3 days |
| 13 | [render_and_engine_perf](plans/plan_render_and_engine_perf_2026-09-21.md) — behaviour-preserving: lineup-aggregate memo + no-events mode for 82:0 halves, `game.ts` and `DeckBuilder.tsx` splits, GameView per-tick memoization, dead code, stale ARCHITECTURE sections | planned | DeckBuilder/PlayerCard waves after mobile_load | `engine/game.ts` + new engine modules, `DeckBuilder.tsx`, `GameView.tsx`, `PlayerCard.tsx` | 3-4 days |
| 14 | draft_resume — resume a draft after an OS kill or reload: rebuild the exact state from the stored seed + pick log (the cube is deterministic), resume prompt, pick-clock rule. Replaces the per-pick autosave dropped from sync_outbox | not yet planned | — (sync_outbox done) | `useDraftEngine.ts`, `DraftRoom.tsx`, `engine/draft.ts` | — |

**Shipping gate — already crossed (2026-09-17).** `main` was pushed to `origin/main`
(commit `7c89111`) before `card_balance` had fully landed — the 2026-09-16 gate ("wait
for card_balance to land before any push") did not hold. Nothing to revert; `card_balance`
itself closed 2026-09-17 with T1-T4/T6 done, T5 split into `card_balance_thresholds`
(closed 2026-09-19, owner override — see Recently completed).

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
| [sync_outbox](completed/plan_sync_outbox_2026-09-21.md) | 2026-09-21 | Cloud sync that survives an installed PWA: the store owner follows login/logout/account switch without a reload, every save resolves locally and goes out through a persisted outbox (one key at a time, backoff, blocked records), deletes are tombstones, baselines persist so a relaunch downloads 0 KB (was every row, both ways), one season and one 82:0 run per roster under deterministic ids, approved-only writes and a `(owner_id, id)` key server-side. Migration applied to production after a rolled-back dry run. T3 (draft autosave) dropped, see `draft_resume`. 97 storage tests, 506/507 overall, smoke green (`fa33b40`..`879fe72`) |
| [challenge_loose_ends](completed/plan_challenge_loose_ends_2026-09-19.md) | 2026-09-19 | Play cards get the same phone `wide` resize player cards got (`PlayCard`/`PlayCardFront`); the 82:0 results screen's primary CTA is now "End Challenge — Results Locked In" (`/rosters`) instead of "Draft a new team"; rosters list shows `Start 82:0`/`Continue 82:0`/`View Result` per run state plus a `W-L · Title (Grade)` summary for finished runs; user stats (`TopNav`) gain a "82:0 Challenges: N completed, best W-L (grade)" line, omitted at zero. 442/443 tests, tsc/lint/check:styles clean, smoke 9/9 |
| [phone_card](completed/plan_phone_card_2026-09-19.md) | 2026-09-19 | Owner rejected two landscape redesign mocks against a real S26+ screenshot, signed off a modest resize instead: phone-only `wide` prop on `size="sm"` `PlayerCard`/`PackRevealCard`, aspect 5/7 → 1.15/1, more badge spacing, retargeted image crop, grid `max-w` factor updated. `DepthSlotColumn` untouched. 442/443 tests, tsc/lint/check:styles clean, smoke 9/9 (`cb4a1c1`) |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
