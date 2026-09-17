---
session: 6c32dc9b-8aa8-4198-8e7c-80ed8313a594
date: 2026-09-14
window: 21:15 - 22:03 (48m)
project: magic-ball
branch: main
scale: 8 user turns, 198 tool calls, 25 files edited, 3 commits, 3 failures
title: Season lifecycle status, locking, roster records, notifications, What's New splash
---

# Season lifecycle, locking, notifications, What's New splash

## What this session was

A same-day plan-then-build: check whether a six-item feature cluster
(notifications/What's New, season phase status, season/roster locking,
per-roster records, minimal user stats, a profile-menu stats blurb) was
already planned (it wasn't), scope and lock a new plan on the spot, implement
all of it, verify live in the browser, commit and push — then, off a bug
report, find and fix an unrelated false-positive sync-conflict bug, then
build a full What's New splash page as a follow-up ask.

## Decisions made

**D1 — Season/roster status is derived, never stored.** `getSeasonPhase()`
computes Pre-Season / Live / Completed straight from existing `currentGame`
(0 vs 1-6 vs 7). No new storage field, no migration, no merge-conflict risk —
chosen specifically because it's computed from data already kept in sync by
`recomputeStandingsFromSchedule`.

**D2 — `getMeta`/`setMeta` added to the `GameStore` interface** (implemented
across `SupabaseGameStore`, `indexedDb.ts`, `memory.ts`) as the shared
mechanism for both notice-dismissal and splash-seen state, replacing
`migrate.ts`'s narrower local `MetaCapable` interface.

**D3 — Completed seasons lock their roster.** `DeckBuilder` shows a read-only
banner and disables the whole interactive area via `pointer-events-none` plus
a guarded save; the rosters overview swaps "Edit" for "View" semantics.

**D4 — `HUMAN_SEAT_ID` constant introduced**, replacing 12 raw `'human-0'`
string literals across the codebase — added as prep work once the exploration
subagent confirmed the human seat is always that literal value.

**D5 — What's New becomes a full-screen splash**, not just a bell dropdown
entry, auto-opening on first load after a new release — modeled on a Proton
reference the user pointed to, but restyled after Claude pulled the app's own
live design tokens (Bebas Neue gradient headline, amber-to-orange CTA, dark
arena background) rather than keeping the first cream/emerald mockup.

**D6 — Fixed an unrelated bug found via a user report, not code review.**
`SupabaseGameStore.pullAll()` compared each row against an in-memory
`baselines` Map that's empty on every fresh page load, so every already-synced
roster looked "changed" and got funneled through `resolveViaMerge`, which
always reports a conflict regardless of content — hence the false "changed on
another device" prompt on every login. Fixed with a real content comparison
before falling back to merge, plus a regression test.

## What was tried and rejected

- The first What's New mockup used the app's own stone/emerald/amber palette
  in a generic card layout — not rejected by the user, but self-corrected
  after Claude pulled the home page's actual CSS tokens live and found they
  didn't match; rebuilt to mirror the real gradient/arena-glow/CTA styling
  before presenting it for approval.

## Build history

1. Checked ROADMAP/plans/HANDOVER for the six-item feature cluster — none
   found. User: "no we will do it now, just propose how you would do it."
2. Dispatched an exploration subagent to map season/roster/storage/profile
   code before proposing a plan.
3. Proposed a plan shape in chat; wrote and locked
   `docs/plans/plan_season_lifecycle_notifications_2026-09-14.md`; added it
   to `ROADMAP.md`.
4. T1: `getSeasonPhase`/`computeUserSeasonStats` in `engine/season.ts`;
   replaced raw `'human-0'` literals with `HUMAN_SEAT_ID`.
5. T2: `getMeta`/`setMeta` added to `GameStore`, `migrate.ts`'s redundant
   interface removed, `supabase.ts` delegation added.
6. T3: `whatsnew.ts` changelog data file, `useNotices.ts` hook (pattern
   matched to existing `useSyncStatus.ts`), `useUserSeasonStats.ts`.
7. T4: notification bell + profile-menu stats blurb wired into `TopNav.tsx`.
8. T5/T6: phase pill + W-L record on the rosters overview; read-only lock
   enforced in `DeckBuilder` and `roster/[id]/page.tsx`.
9. Full verification: tsc clean, lint (1 fix needed in `useNotices.ts`), all
   217 unit tests + 9 new `season.test.ts` cases, build green.
10. Live-verified in the browser: phase pill/record, bell dropdown, profile
    stats blurb, locked-title text, DeckBuilder read-only banner, disabled
    pointer-events — all confirmed working end to end.
11. Doc lifecycle: plan moved to `docs/completed/`, `HANDOVER.md`/`ROADMAP.md`
    updated within budget. Committed (`b273079`), pushed on request.
12. User reported the false "changed on another device" login bug; root-caused
    and fixed `SupabaseGameStore.pullAll()`'s baseline check, added a
    regression test, committed and pushed (`23de7b2`).
13. User asked for a full-screen What's New splash with copy/image proposal.
    Built a mockup via the visualize tool, initially in the app's stone/amber
    palette, then rebuilt against the app's real live tokens after pulling
    them from the running page.
14. On "build it, approved": rewrote `whatsnew.ts` to a richer
    release/highlights shape, updated `useNotices.ts`, built
    `WhatsNewSplash.tsx`, mounted it in `layout.tsx`.
15. Live-verified: reset IndexedDB meta to simulate a fresh user, confirmed
    the splash renders and matches the home page aesthetic, confirmed
    dismissal persists across reload via `getMeta`/`setMeta`, confirmed the
    bell still shows an unread dot. Committed and pushed (`43e8719`).

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- Checks for existing plan coverage before scoping new work, even under
  pressure to move fast: asked "Are the following tasks already in any
  plan?" before any implementation, then overrode the "let's plan it
  properly first" instinct himself — "no we will do it now, just propose how
  you would do it."
- Supplies non-obvious implementation facts unprompted during design
  ("the human seat is always `'human-0'`") rather than leaving Claude to
  discover them.
- Fast commit/push cadence once verified — "commit this" then "push it" as
  separate, minimal instructions, no elaboration needed.
- Reports a bug in plain end-user language with no diagnosis attached
  ("even though nothing happened?") and expects investigation from scratch.
- For a cosmetic/content ask (splash copy and image), explicitly invites
  Claude's own visual judgment ("feel free to send that reference image if
  you'd rather I match something specific") rather than pre-specifying design.

## Open threads

- None explicit — all six planned features, the sync-conflict bug fix, and
  the What's New splash were implemented, verified, committed, and pushed
  within this session.
