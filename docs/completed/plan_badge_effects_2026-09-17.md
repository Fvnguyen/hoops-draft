# Plan: badge_effects

File: `docs/completed/plan_badge_effects_2026-09-17.md`. Status: done 2026-09-17 (closed
by owner call without a full plan ever being drafted). Sequence: was 9 in
`docs/ROADMAP.md`, depended on `engine_possession_model` (done).

## Outcome

Badge levels as gameplay content shipped as part of `card_balance`'s T2/T3, not as a
separate plan: a real-starter-aware rarity mechanism (`SeasonStat.gs` replacing the MPG
proxy), Uncommon->Rare badge-level gates, Two-Way Disruptor/Playmaking Maestro/Sniper
rebuilt as two-badge-level combo conditions (`KEYSTONE_CONDITIONS`, no longer card
traits), and Point Forward (first AND-badge play role). Commits `9e2910d`, `c5c034c`,
`58fd82d`, `d96b96f`, `037710d` — full detail in
[plan_card_balance_2026-09-13.md](../plans/plan_card_balance_2026-09-13.md).

The scope this roadmap row originally named — badge levels as their own
"individual-brilliance" special effects layered on top of the lineup model (a badge
firing its own in-possession bonus, distinct from just feeding the lineup aggregation) —
was not built and is not currently planned. Closed on the owner's call, 2026-09-17.
