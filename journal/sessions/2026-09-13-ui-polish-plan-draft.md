---
session: bc0a88bd-5ec9-410f-af0d-a0c129aff5fe
date: 2026-09-13
window: 20:18 - 20:27 (8m)
project: magic-ball
branch: main
scale: 1 user turn, 9 tool calls, 2 files edited, 0 commits, 1 failure
title: Plan draft for UI polish small fixes
---

# UI polish small fixes — plan draft

## What this session was

A short planning-only session: draft a follow-up plan doc for four small UI
polish fixes (drag preview timing, pack-reveal handler timing, draft-pick
confirmation, deckbuilding identity radar sizing), sequence it on the roadmap,
and lock the decisions. No implementation happened.

## Decisions made

**D1 — Drag preview dismisses on click, not on a timer.** Original draft
locked a 300ms-hover-show / mouseLeave-dismiss behavior. Corrected mid-review:
"D1: is not about time, instead previews should be immediately dismissed on
mouseclick."

Three other decisions were locked as originally drafted and not challenged:
pack-reveal cards withhold preview handlers until their reveal animation
completes; a draft pick is first-click-highlight + second-click-confirm with
a 2s auto-confirm timeout; the deckbuilding identity radar scales `w-40 h-40`
→ `w-56 h-56` only on that view.

## What was tried and rejected

- Nothing was rejected outright — D1's time-based dismissal was corrected,
  not vetoed as an approach.

## Build history

1. Read `ROADMAP.md`, `TEMPLATE.md`, `HANDOVER.md` to scope the plan.
2. Wrote `docs/plans/plan_ui_polish_small_fixes_2026-09-13.md`, sequenced as
   1b (right after `ui_draft_deckbuild_pack`, can run in parallel — disjoint
   components), sized ~0.25 day.
3. Edited `ROADMAP.md` to add the sequence entry — hit a stale-read failure
   (file changed on disk since read), re-read and retried.
4. Fixed the plan's files-owned list to include `TopKPIBand`.
5. User corrected D1's wording; plan updated. Session ended on "Approve the
   plan?" — no approval given yet in this window.

## Working-style observations

> Raw material for the profile. Dated, cited, not yet synthesized.

- Corrects a locked decision by naming the concrete mechanism he wants, not
  just flagging the mechanism as wrong: "is not about time, instead previews
  should be immediatly dismissed on mouseclick."

## Open threads

- Plan not yet approved as of this session's end.
