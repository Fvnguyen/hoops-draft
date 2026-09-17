---
session: 6dc282b7-1a18-403e-8145-d983e6390700
date: 2026-09-15
window: 20:23:43 - 2026-09-16 06:02:46 (~9.5h, overnight)
project: magic-ball
branch: main
scale: 21 user turns, 255 tool calls, 10 commits, 17 failures
title: game_canvas plan challenge, falsification, and the zoom-scaling mobile fix
---

# game_canvas: challenged, falsified, replaced by CSS-zoom scaling

## What this session was

Fabian asked Claude to challenge a plan proposing a "game canvas" (a scaled
rendering mode) to solve mobile layout brittleness. The challenge led to a
falsification experiment that overturned the plan's own premise, a
recommendation to reject the canvas entirely, and instead a from-scratch
mobile strategy built around CSS `zoom: 0.7` for coarse-pointer narrow
viewports. The rest of the session was iterative: merge a sibling branch,
fan out parallel fixes, and absorb roughly a dozen rounds of Fabian's live
device/screenshot feedback (home page, draft room, deck builder, season view,
card previews, pack art, context-menu conflicts, image loading) before
closing the plan.

## Decisions made

**D1 — No canvas; go with CSS zoom instead.** Full reversal of the plan's
premise. Reasoning: the four "layout is brittle" symptoms driving the canvas
proposal all traced to ordinary layout bugs plus an audit rule that couldn't
detect them (see below), not to fluid-layout brittleness. A canvas would add
a permanent second rendering mode with real ongoing cost — cited concretely:
9 `position: fixed` components would need pointer-math adjustments, and every
44px control would shrink to 41px on a real S24+ in-browser.
→ Fabian: "Agreed, go forward with that."

**D2 — Mobile-audit's overflow check was structurally blind.** The original
check used `scrollWidth`, which can't see leftward overflow or anything
clipped by an `overflow-hidden` ancestor. Replaced with a rule that measures
where text actually renders (own text outside viewport, no scrollable
ancestor, translated drawers excluded) plus a new 780×360 `phone-narrow`
project. This is the falsification step Fabian asked for directly ("do it"),
and it reversed the plan's own "audited clean" claim: the reference 830×385
viewport had four real clips the old check missed.

**D3 — Height, not width, is the real constraint.** Reopened after Fabian
pointed out the home page fails his own UAT criterion (full page visible, no
scroll) even after D0/T0 fixes — a failure the harness didn't catch because
it only checks horizontal overflow. Fabian supplied the empirical anchor
himself: on his S26+ in Chrome landscape, everything already "almost works"
except deck builder, suggesting scaling is the right lever. Floor set at 0.7
zoom, vertical scroll allowed only for game/season screens.

**D4 — Two-row pick grid over single-row squish.** Fabian's explicit
preference, stated before implementation: "try two rows to scale first"
rather than accept a single overcrowded row, with minor vertical scroll as
the fallback only if two rows can't fit.

**D5 — Long-press card preview shows the back face beside the front**, not a
new gesture. Chosen as option 1 of three Claude proposed, after Fabian asked
"that means on mobile no way to see backside with stats in draft?" — reuses
the existing screen-centered overlay rather than adding a second interaction.

**D6 — Card-back context menu suppressed on all pointers, not just
coarse/touch.** Started scoped to touch devices only; widened same-turn after
Fabian reported the native Android/PWA long-press sheet still fired ("no
context menu on cards anywhere").

## What was tried and rejected

- **The game_canvas plan itself** — killed outright after falsification; see
  D1. Fabian's phrasing made clear this wasn't a reluctant compromise: "My
  recommendation is no canvas" was Claude's own conclusion, accepted without
  pushback.
- **`resize_window` mid-review** — the user declined the action twice ("The
  user doesn't want to take this action right now. STOP..."), and Claude
  respected the stop rather than retrying with a workaround.
- **Fixed 600px width cap for the second-pick draft grid** — cut off the
  bottom row once the draft header/ticker were present; replaced with a
  height-derived cap accounting for that header.
- **Squished single-row pick layout** — explicitly rejected by Fabian in favor
  of D4's two-row approach.

## Build history

1. Read the plan + surrounding context (handover, roadmap, superseded mobile
   plan, layout/gate code); delivered a ranked, numbered challenge.
2. Falsification run: rewrote the overflow-detection rule, added
   `phone-narrow` project, found the four real clips; plan rewritten around
   the findings (T0 four disjoint layout fixes replace T1's canvas rewrite).
3. T0 executed and verified live at three widths; nothing committed yet,
   offered for review first.
4. Home-page UAT failure caught by Fabian, not the harness; height problem
   diagnosed per-screen with measured content heights.
5. Zoom-scaling spike (`zoom: 0.7` under coarse-pointer + <1000px), verified
   against viewport-unit/rect/breakpoint behavior before writing real code.
6. Draft-pack grid iterated live (single row → two rows → width/gap tuning)
   against real screenshots at three widths.
7. Committed 3 commits (prior session's untracked mobile work, the audit rule
   + T0 fixes, the docs recording the no-canvas decision) — `11348e4`,
   `4decbb5`, `0b5573f`.
8. Fabian caught the zoomed layout still failing his own UAT bar live;
   diagnosed and fixed (season side-by-side, basic-play click-to-slot, card
   long-press preview, two-line card names, static reveal face) — 3 parallel
   subagents + Claude's own card-specific fixes — committed `e7b9071`.
9. Merged sibling branch `claude/swagger-cloud-version-chip-b28092` (Supabase
   fix, card art) — byte-identical images restored from working tree first to
   avoid a spurious diff.
10. Round 2 of live feedback (pack sizing, text-overlap, tap-to-deselect vs.
    auto-pick, double-click inconsistency) — `e2cb26b`.
11. What's New entry pushed (`e913011`), dialog height made zoom-aware
    (`cc18cae`).
12. Card-back preview panel added (`b2adf25`), per D5.
13. Context-menu suppression fix across a session gap — dev server had
    stopped; restarted, verified, fixed, pushed (`5cdc14c`).
14. Two follow-up questions answered directly from code inspection (PWA
    auto-upgrade behavior; slow headshot loading on phone — diagnosed as
    unoptimized 182KB PNGs at 12x render resolution, not a phone bug).
15. Image optimization (`next/image` migration + pack preloading) — `f2a05bb`.
16. Session closed: plan moved to `docs/completed/`, roadmap/handover updated,
    new memory file written for the mobile-verification workflow.

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- **Asks for a challenge before asking for execution.** Opening message is
  "Review... and challenge," a distinct step from "do it" two turns later —
  wants the critique separated from the build.
- **Catches the harness's own blind spot from his own device, not from a
  report.** "Isn't this first homepage view directly failing UAT criteria set
  out by me? Not the full screen visible, scrolling needed in each direction"
  — Claude conceded directly: "Yes, it fails, and I should have caught it."
- **Supplies his own empirical anchor to steer the fix.** "if I open it in
  chrome on my S26+ and put to landscape most screens already almost work...
  EXCEPT deckbuilding. So starting point is likely just proportionally
  scaling everything down incl. fontsize?" — a hypothesis offered as a
  starting point, not a directive, and it was largely correct.
- **Gives ranked fallback preferences up front** rather than leaving the
  approach open: "vertical scrolling (never horizontal)" or "new mobile only
  UI," and later "try two rows to scale first" before accepting scroll.
- **Firmly stops an in-progress action twice** via the interactive
  declined-action mechanism rather than letting it run — a hard interrupt,
  not a redirect.
- **Batches unrelated asks into one message** routinely: merge a branch +
  fix four unrelated bugs + note an inconsistency, all in one turn (the
  2026-09-15 22:50 message lists four numbered items plus a branch-merge
  instruction).
- **Trusts silence as approval to keep going**: after "Go, floor at 0.7,
  vertical scroll ok for game and season," no further check-in was requested
  through a long stretch of live-code iteration.

## Open threads

- The real-device pass was effectively substituted by Fabian's own S26+
  feedback rounds; no separate formal device-lab pass occurred.
- A dedicated "phone card" (wider draft-room card design) was carried forward
  as a new, not-yet-planned roadmap row — explicitly deferred as design-first
  work for a future session.
- The untracked second pack-image variant (`pack_2025_2026_variant_1.png`)
  remains uncommitted-to-app, present in the repo but unreferenced.
