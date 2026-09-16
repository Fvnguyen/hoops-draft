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
| 5 | [card_balance](plans/plan_card_balance_2026-09-13.md) — position data, rarity/badge distribution, play & plan content, rating retune + OVR-40 floor against the new engine | in progress (baseline 2026-09-16) | engine_possession_model (merged to local main 2026-09-16, unpushed) | `data/fetch_players.py`, `engine/ratings.ts`, `engine/balance.ts` rating section, `engine/playbook.ts` catalog, `engine/archetypes.ts` catalog, `src/data/cards.json` | 2-3 days |
| 6 | [game_theater](plans/plan_game_theater_2026-09-13.md) — structured narration, game-flow beats, crunch time, playback, box score + summary | merged to local main 2026-09-17 (unpushed); owner in-app pass done | engine_possession_model (done, merged) | `engine/game.ts`, `src/narration/`, `GameView.tsx`, `BoxScore.tsx` | done |
| 7 | android_twa — Bubblewrap/TWA Play Store listing (proposal G.2). Conditional: only once the installed web app is something the owner would hand to a friend | not yet planned | — (game_canvas done) | — | 2-3 days |
| 9 | badge_effects — badge levels as "individual brilliance" special effects on top of the lineup model (owner 2026-09-16); not dimension mechanics | not yet planned | engine_possession_model | `engine/game.ts`, `engine/balance.ts` badge section | 1-2 days |
| 8 | phone_card — a wider draft-room card variant for phones so the unused horizontal space carries name + badges (game_canvas D7). Design-first: canvas mock-up at 830x385 and owner sign-off before code | not yet planned | — | `PlayerCard.tsx` (new variant), `PackOpener.tsx`, `DraftRoom.tsx` grid | 1 day |

**Shipping gate (owner, 2026-09-16):** `engine_possession_model` was fast-forwarded into
local `main` on 2026-09-16 (`3226cf2`); `game_theater` merged to local `main` on
2026-09-17 after an in-app UI pass. `main` is still NOT pushed (origin/main deploys to
Vercel) — push only once `card_balance` has landed too. No PR before then.

Re-sequenced 2026-09-15: `ui_foundation` (done that evening) went ahead of
`mobile_responsive` because its tokens and primitives resolve most of the mobile
audit's punch list (absolute-px type/hit-area defects, not breakpoints) in one pass;
mobile T6 then re-audits and fixes only what is left. Earlier that day:
`mobile_responsive` took over the manifest/icons/auto-login work; `mobile_pwa_shell` is removed (a service worker and offline page cannot work while
`proxy.ts` gates every route on a live Supabase session — revisit only with an offline-
tolerant auth design) and `android_twa` (#7) is conditional on the owner wanting to hand the installed app to a friend (`game_canvas` done 2026-09-16). `deckbuilder_ux` (done)
was added after the owner's live review of ui_foundation the same evening: one deck-builder
redesign for all devices, canvas-signed first, absorbing the mobile plan's tap-to-place.
The 2026-09-14 note (card_balance waits for draft_ai's contested-draft data) was set
aside by the owner on 2026-09-16: card_balance starts first on the merged engine, and
its T2/T5 numbers are re-checked once draft_ai lands. Scope sketch for #7 is proposal G.2 in
`docs/completed/review_code_and_architecture_2026-09-12.md`.

## Recently completed (latest three)

| Plan | Completed | Outcome |
|---|---|---|
| [engine_possession_model](completed/plan_engine_possession_model_2026-09-16.md) | 2026-09-16 | Standardised, designed lineup aggregation (k / hole tax per dimension in one `balance.ts` table), edges centred on in-game lineups, edge 0.20/0.08 with per-side channel weights, possession battle replaced by per-possession turnovers / offensive rebounds / creator steer, shot profile from the on-court five; `--levers` table finishing 2.66 … mid 0.75; talent share 21.9% game / 49.3% season; unmerged until game_theater + card_balance; commits `ff6a59a`..`18eb277` |
| [game_canvas](completed/plan_game_canvas_2026-09-15.md) | 2026-09-16 | Phones (coarse pointer, <1000px) render at CSS `zoom: 0.7` with `h-dvh-z` shells; Home and the draft (two rows of four) fit with no scroll, deck builder scrolls only inside columns, game/season scroll by decision; text-position + no-scroll audit rules at 780/830/1244 = 0 findings; long-press card preview (front + back + badge legend), touch tap contract (select/deselect, dock confirms), headshots via next/image + preload; supersedes `mobile_responsive`; commits `11348e4`..`f2a05bb` |
| [deckbuilder_ux](completed/plan_deckbuilder_ux_2026-09-15.md) | 2026-09-15 | Design-first (8 signed artboards): 56px HUD band with overlay report, plays + roster as dockable sidebars, depth chart per artboard with 148px column floor, play tiles, click-to-assign through pure engine helpers; `deckbuilder.spec` at 3 tiers; mobile audit deck-builder 0/0; commits `9f036b3`..`237afff` |

## Model tiers used in plans

| Tier | Anthropic | Google | Use for |
|---|---|---|---|
| top | Fable 5.1 / Opus 5 | Gemini 3 Pro (Deep Think for design) | design decisions, engine maths, anything that changes balance numbers, reviewing agents' work |
| mid | Sonnet 5 | Gemini 3 Pro | implementing a task from a locked plan, tests, UI components |
| low | Haiku 4.5 | Gemini 3 Flash | mechanical edits, text/content writing from a spec, lint fixes, doc moves |

"Main driver" in a plan = the model running the session that reads the plan, spawns
agents, verifies and commits. Agents never run git; the driver verifies (tsc, eslint,
vitest, balance/feasibility numbers, screenshots) and commits.
