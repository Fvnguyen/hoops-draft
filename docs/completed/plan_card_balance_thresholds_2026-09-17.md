# Plan: card_balance_thresholds

File: `docs/completed/plan_card_balance_thresholds_2026-09-17.md`. Status: done 2026-09-19
(owner override — closed before its own literal exit criteria, see note below).
Sequence: see `docs/ROADMAP.md`. Depends on: draft_ai (done 2026-09-19). Files owned:
`engine/archetypes.ts` (threshold constants only — not the catalog names/descriptions/
colours, which `plan_card_balance_2026-09-13.md` already locked and closed),
`docs/game_mechanics.md` (reachability note if numbers move).

**Closing note (2026-09-19, corrected same day):** closed without meeting the literal
exit criteria (`npm run feasibility -- 200` hitting the D8 25-35%/8-15% bands). This
plan's own dependency, `draft_ai`, landed the same day this plan closed — but the D8
bands this plan was written to retune against had already been discarded as a target
entirely by the owner on 2026-09-17 (see `plan_draft_ai_2026-09-13.md`'s T4: "parked...
revisit only if real drafting feels broken, not against the D8 numbers in the
abstract"). Retuning thresholds against a target the owner no longer wants was never
the right move, landed `draft_ai` or not. What DID happen instead, as part of a
separate "balance workflow" (`AGENTS.md`, stage 5): `MONO_THRESHOLDS_BY_COLOR` (this
plan's T2 target) was removed entirely rather than re-tuned — it was a stale defense-
colour discount from before badges were rebalanced, not a D8-era retune — and
`MONO_THRESHOLDS`/`TWO_COLOR_THRESHOLDS`/`GOLD_THRESHOLDS` were left untouched. If a
real threshold problem is ever reported against live drafting, it needs a fresh plan,
not a reopen of this one — the file layout it names (`MONO_THRESHOLDS_BY_COLOR`) no
longer exists to retune.

## Goal

`plan_card_balance_2026-09-13.md` split this out as its T5: re-tune
`MONO_THRESHOLDS`/`TWO_COLOR_THRESHOLDS`/`GOLD_THRESHOLDS` (and any per-colour override in
`MONO_THRESHOLDS_BY_COLOR`) against `draft_ai`'s D8 bands once bots actually draft toward
a plan instead of raw PER. Doing this before draft_ai lands measures nothing — bots
online% today (single digits for most colours, see below) reflects the *absence* of
plan-chasing, not a threshold problem.

## Real-data findings

- **2026-09-17, pre-draft_ai baseline** (`npm run feasibility -- 200`, current
  thresholds): bot online% — Finisher 9%, Mid-Range Maestro 9%, Sharpshooter 8%, Floor
  General 4%, Glass Cleaner 11%, Lockdown Defender 24%, Paint Protector 14%. draft_ai's
  D8 target is 25-35% online / 8-15% dedicated for bots once they chase a plan; today's
  numbers are pre-draft_ai and not the thing this plan re-tunes against.
- **2026-09-17, `npm run balance -- 1000 --seed 42 --ab`** (post card_balance T1-T4, T6):
  PPP 1.042, sd 13.6, margin mean 15.6, 85.0% in [90,130], home win 54.8%. game_engine
  D5's bands are PPP 1.05-1.12 / sd 12-13 / margin 12-14 / home win 52-56%; this run sits
  just outside on PPP, sd and margin. The D5 sweep table itself showed similar small
  misses at other scale points, so this isn't necessarily new drift from card_balance's
  content changes — but re-check it once draft_ai's contested drafts are live, since a
  materially different roster mix (bots no longer flat-out taking the best-PER card)
  could shift these numbers further and is worth a fresh reading, not an assumption.

## Decisions (locked)

- D1 Re-tune targets are `draft_ai` D8, unchanged: bots reach Online in 25-35% of
  drafts, Dedicated 8-15%; a focused human drafter Online 40-55%. Do not lower these
  targets to fit whatever the contested draft turns out to produce — if thresholds can't
  hit them, that's a `draft_ai` tuning question (`PLAN_PULL`, rarity multipliers,
  positional factors), raised back to that plan, not silently absorbed here.
- D2 Retune `npm run feasibility -- 200` thresholds colour-by-colour (mono first, then
  two-colour, then gold), never all at once — a single global multiplier historically
  overshoots the colours that were already close.
- D3 If a colour's bot online% is still far outside the band after a reasonable
  threshold change (more than one full re-tune pass), stop and report it rather than
  keep pushing the threshold — it may be a badge-scarcity issue from card_balance's own
  distribution, not something a threshold can fix alone.

## Out of scope

Anything in `plan_card_balance_2026-09-13.md`'s closed scope (positions, rarity, badge
coverage, the play catalog, `CARD_SET_VERSION`) — reopen that plan's decisions only if a
threshold re-tune genuinely can't work without touching them, and say so explicitly
rather than drifting scope quietly.

## Tasks

- T1 Run `npm run feasibility -- 200` on the post-draft_ai engine; record the baseline
  bot/focused online-dedicated numbers per colour. Tier: low.
- T2 Re-tune `MONO_THRESHOLDS`/`MONO_THRESHOLDS_BY_COLOR` to D8; re-run feasibility after
  each colour change. Tier: top.
- T3 Re-tune `TWO_COLOR_THRESHOLDS` and `GOLD_THRESHOLDS` the same way. Tier: top.
- T4 Re-run `npm run balance -- 1000 --seed 42 --ab`; confirm still inside game_engine
  D5's bands (or report the miss per D3). Tier: mid.

## Recommended model tier

Main driver: Fable 5.1 or Opus 5 / Gemini 3 Pro (threshold tuning is statistical judgment
over a live feasibility loop, same as card_balance's T2/T5 were rated). No parallel
waves — each threshold change needs the previous one's feasibility read before the next.

## Verification / exit criteria

- `npm run feasibility -- 200` hits every draft_ai D8 band (bot and focused, mono/two/gold).
- `npm run balance -- 1000 --seed 42 --ab` inside game_engine D5's bands, or a filed
  report explaining the specific miss (D3).
- 338/338 (or current count) Vitest tests still pass; `play-catalog-coverage.test.ts`
  unaffected (threshold changes don't touch play definitions).
