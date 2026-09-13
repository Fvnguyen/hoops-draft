# Plan: analytics_tooling

Status: planned
Sequence: 1 in `docs/ROADMAP.md`. Depends on: nothing. Files owned:
`frontend/scripts/balance.ts`, `frontend/scripts/analyze.ts` (new),
`scripts/analyze_game_data.js` (deleted), `frontend/src/app/debug/page.tsx`,
`frontend/src/app/api/game-logs/route.ts`, `docs/analytics/*`.

## Goal

Every later balance plan quotes numbers. Today the headless harness (`npm run balance`)
measures the current engine, but the app-export analyzer (`npm run analyze`) and the
analytics docs still report synergies and `PLAY_EFFECTS` that no longer exist, and neither
tool can answer "how much does a staffed play or a Dedicated identity add to margin".
After this plan both tools describe the game as it is, and the balance harness has a
fixed-roster A/B mode that plans 2-4 use as their scoreboard.

## Decisions (locked)

- D1 `scripts/analyze_game_data.js` is replaced by `frontend/scripts/analyze.ts` (tsx, imports
  the real engine like `balance.ts` does). `npm run analyze` at the root points to it. The JS
  file is deleted, not kept as a fallback.
- D2 The analyzer reads the newest `data/game_logs/full_dump_*.json` and reports, per
  roster: identity tiers reached (per lane), selected identity, staffed plays (roles
  filled / total), and per game: play call counts from `PossessionEvent.calledPlays`,
  score bands, margin, home/away, win rate by identity tier and by number of staffed
  plays. The old sections (synergy activation, `PLAY_EFFECTS` activation, OVR-vs-win
  correlation) are removed. Draft cube integrity and rarity distribution stay.
- D3 `balance.ts` gains `--ab`: for N seeded drafts it builds bot rosters, then for the
  human seat simulates each opponent twice: once with identities and play assignments as
  built, once with `archetypes = {}` and `playAssignments = {}`. It reports mean margin
  delta, win-rate delta, and the same split by identity tier and staffed-play count. It
  also reports home vs away margin. Seeds make both arms identical except for the
  treatment.
- D4 The `/debug` export keeps its shape but must include, per seat, `builtRoster.archetypes`
  and `builtRoster.playAssignments`, and per game the `calledPlays` of every possession.
  Verify rather than assume; add what is missing.
- D5 `docs/analytics/analysis_report.md` and `analytics_summary.md` get a one-line banner at
  the top: "Stale: measured before Phase 0 and the plays & identities milestone; regenerate
  with `npm run analyze`." They are not deleted (they hold the owner's notes). A fresh
  report generated at the end of this plan is saved as `docs/analytics/report_2026-09.md`.
- D6 Report output is plain text to stdout, deterministic ordering, no colours, so it can
  be pasted into commits and handover docs.

## Out of scope

Changing any engine or balance constant. Web dashboards. Storing analytics in the app.

## Tasks

- T1 `frontend/scripts/analyze.ts` per D1/D2; root `package.json` `analyze` script updated;
  delete `scripts/analyze_game_data.js`; update `AGENTS.md`/`README.md` command mentions.
  Done when it runs against the current newest dump and every section prints. Tier: mid.
- T2 `balance.ts --ab` per D3, plus home/away split. Done when
  `npm run balance -- 200 --seed 42 --ab` prints the deltas and a Vitest test asserts the
  A/B harness gives a zero delta when treatment equals control. Tier: mid.
- T3 `/debug` export audit per D4 (add missing fields; `/api/game-logs` unchanged). Done
  when T1 reads a fresh export without fallbacks. Tier: low.
- T4 Banners and fresh report per D5. Tier: low.

## Parallelization

- Wave 0 (driver, 10 min): write the contract, the JSON fields T1 reads and T3 must
  export, as a comment block at the top of `analyze.ts` before T1/T3 start.
- Wave 1 (parallel): T1 (mid), T2 (mid), T3 (low). Disjoint files.
- Wave 2: T4 (low) after T1; driver runs both tools and commits.

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro. Agents: Sonnet 5 for T1/T2, Haiku 4.5 or
Gemini 3 Flash for T3/T4. No top-tier model needed; nothing here changes game behaviour.

## Verification / exit criteria

- `npm run analyze` prints a report from a fresh `/debug` export with zero references to
  synergies or `PLAY_EFFECTS`.
- `npm run balance -- 200 --seed 42 --ab` prints margin/win-rate deltas; the zero-delta
  test passes.
- `npm test` green; `npx tsc --noEmit` clean in `frontend/`.
