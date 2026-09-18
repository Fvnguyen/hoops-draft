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
| [phone_card](completed/plan_phone_card_2026-09-19.md) | 2026-09-19 | Owner rejected two landscape redesign mocks against a real S26+ screenshot, signed off a modest resize instead: phone-only `wide` prop on `size="sm"` `PlayerCard`/`PackRevealCard`, aspect 5/7 → 1.15/1, more badge spacing, retargeted image crop, grid `max-w` factor updated. `DepthSlotColumn` untouched. 442/443 tests, tsc/lint/check:styles clean, smoke 9/9 (`cb4a1c1`) |
| [mobile_native_feel](completed/plan_mobile_native_feel_2026-09-18.md) | 2026-09-19 | No context menu/double-tap-zoom (`touch-action`/`user-select`/`-webkit-touch-callout` globally), Android/PWA back button shows a "Leave this screen?" sheet on draft room/deck builder instead of silent history-back, dropped two per-move deck-builder undo toasts. Verified via browser-pane mobile viewport (computed styles, live back-guard trigger/cancel/re-arm) — no physical device or Chrome touch-emulation available in this sandbox, flagged as the one open unverified item. 442/443 tests, build, smoke 9/9 |
| [draft_ai](completed/plan_draft_ai_2026-09-13.md) | 2026-09-19 | Bots draw a target/secondary plan and score picks value-first-then-plan (ramping across the draft), hard position-coverage guarantee (no more 4-on-5 rosters). Implemented 2026-09-17 on an orphaned branch that forked off main and was never merged (diverged 47 commits); landed today via a targeted cherry-pick. T4 (D8 identity-reach tuning) explicitly parked by owner call, not an exit criterion. 442/443 tests (one pre-existing unrelated drift), `npm run balance`/`feasibility` clean, live draft + ticker screenshot-verified |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
