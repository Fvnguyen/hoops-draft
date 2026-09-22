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
| 16 | [pvp_draft](plans/plan_pvp_draft_2026-09-22.md) — two humans live in one cube draft from seats 0 and 4, 45 s server deadline, deterministic auto-pick, offline finish, hidden opponent, lock-step deck building | planned | 14, 15 | `engine/draftReplay.ts`, `hooks/usePvpDraft.ts` (new), `DraftRoom.tsx`, `app/playoffs/[id]/{draft,build}` | 2 days |
| 17 | [pvp_series](plans/plan_pvp_series_2026-09-22.md) — best-of-seven, coin flip 2-2-1-1-1, server-advanced games watched at each player's pace, 82:0 front office as the sideboard at two wins (hold / lineup / one trade), results, profile record, rematch, home entry | planned | 15, 16 | `engine/playoffs.ts` (new), `app/api/match/[id]/advance`, `app/playoffs/**`, `components/playoffs/*`, `GameView.tsx` (reveal gate), `HomeModePicker.tsx` | 2-3 days |

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
| [pvp_match](completed/plan_pvp_match_2026-09-22.md) | 2026-09-22 | Playoffs match record: `public.matches` with security-definer RPCs (invite/respond/pick/autopick/lock/sideboard/seen/heartbeat/expire), version CAS, participant RLS, approved-only `user_directory`; applied to production after a rolled-back dry run (16 SQL cases). Realtime channel with polling fallback, `useMatch`/`useMatchList`, `/playoffs/new`, bell Accept/Decline, server-side game simulation route. Two-account invite spec green; `/` JS +1 KB gz; 655/655 tests (`98cf50b`..this commit) |
| [draft_resume](completed/plan_draft_resume_2026-09-22.md) | 2026-09-22 | A draft is a pure replay of seed + human picks (`engine/draftReplay.ts`, multi-human seats for PvP); the hook derives seats/pickLog from it, the session is saved after every pick and `/draft` offers Resume/Abandon (a resumed draft keeps its mode). 200-draft equivalence test; 655/655 tests, checksum 219438687, draft/draft-resume/visual/smoke/topnav 20/20, phone audit 0 findings over 9 screens (`b86dbe4`..this commit) |
| [render_and_engine_perf](completed/plan_render_and_engine_perf_2026-09-21.md) | 2026-09-22 | Behaviour-preserving speed and structure: 82:0 half 136 -> 71 ms, half + ghost 263 -> 149 ms (lineup memo, no-events simulation, ghost only when the roster changed), engine checksum and balance baseline unchanged; `game.ts` 1500 -> 364 lines over five modules, `DeckBuilder.tsx` 1536 -> 686 (pure reducer `applyBuilderAction` + sidebars/hooks), `PlayerCard.tsx` 1450 -> 918; `TeamBlock` 46 -> 10 renders per 23 possessions; seasons reproducible from their seed; narration off the engine's rng; rosters page front-only cards; long-press preview on every deck-builder card. 631/632 tests, Playwright 57/57 (`faae707`..`b21a285`) |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
