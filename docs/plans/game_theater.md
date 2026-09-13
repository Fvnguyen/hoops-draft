# Plan: game_theater

Status: planned
Sequence: 5 in `docs/ROADMAP.md`. Depends on: game_engine (both edit `game.ts`; run
after it to avoid conflicts). Files owned: `frontend/src/engine/game.ts` (narration only:
`generateNarrative`, the `*_TEXTS` pools, `PossessionEvent.narrativeText`), new
`frontend/src/narration/` (templates, beats, renderer), `components/GameView.tsx`,
`tests/unit/narration*.test.ts`.

## Goal

The game theater is the payoff of drafting and building; today it is one line of
template text per possession picked from eight small pools, unaware of the play that was
called, the identity on the floor, runs, lead changes or the clock. After this plan the
narration reads like a broadcast: called plays and coverages are named, scoring runs and
lead changes are called out, quarters get a summary, clutch time is flagged, and the
viewer can control playback speed.

## Decisions (locked)

- D1 The engine stops producing prose. `PossessionEvent.narrativeText` is replaced by a
  structured `PossessionEvent.narrative`:
  `{ kind, channel?, actorId, assistId?, defenderId?, calledPlayId?, coverageId?,
     isAnd1, isPossessionWin, tags: string[] }` where `kind` is the current
  `narrativeHint` union. Prose is rendered outside the engine. This keeps the engine pure
  and makes localisation possible later.
- D2 Rendering lives in `src/narration/render.ts`: `renderPossession(event, ctx, pick)`
  returns a string from template pools keyed by `kind` x `channel`, with placeholders for
  actor, assist, defender, play and coverage names. `pick` is a deterministic index
  function seeded from the game seed + possession index, so re-rendering the same game
  gives the same text (no `Math.random`).
- D3 Template pools: at least **6** variants per kind/channel combination, at least **3**
  play-aware variants per play in the catalog ("Horns action: {actor} curls off the
  elbow...") and per coverage, and a no-repeat rule: a variant is not reused within the
  last 5 possessions of the same kind. Text is written to a house style: present tense,
  under 110 characters, no exclamation marks except and-ones and game winners.
- D4 Game-flow beats are computed by a pure function `computeBeats(theater)` in
  `src/narration/beats.ts` from the events, not stored: scoring runs (8-0 or better),
  lead changes, ties, largest lead, quarter summaries (score, top scorer, shooting split),
  clutch window (final 2:00 of Q4/OT within 5 points), OT start, game winner. Beats are
  interleaved into the play-by-play list at the right possession index.
- D5 Identity flavour: once per quarter, if the offense's selected identity is Online or
  better, one line references it ("The Spacing Machine is humming: 5 of the last 7 from
  deep."). Never more than one identity line per quarter per team.
- D6 Playback in `GameView.tsx`: speed 1x / 2x / 4x / "to end", pause, auto-scroll that
  stops when the user scrolls up, beats rendered as distinct rows (quarter summary as a
  card, runs as a highlighted line). The existing live box score stays.
- D7 Backward compatibility: seasons saved with `narrativeText` still play; the renderer
  falls back to the stored text when `narrative` is absent. Removed once data_storage
  re-simulates games from seeds.
- D8 No audio, no images, no commentator personas, no per-player catchphrases.

## Out of scope

Simulation changes (game_engine), box score changes, mobile layout (mobile_pwa).

## Tasks

- T1 Engine: `narrative` per D1 emitted alongside the existing text for one release;
  test: a fixed seed produces the same `narrative` sequence; purity test passes.
  Tier: mid.
- T2 Renderer per D2 and the no-repeat rule per D3; test: determinism and no repeats
  within 5. Tier: mid.
- T3 Template content per D3 and D5 written as data files in `src/narration/templates/`
  (one file per kind, one per play, one per coverage). Tier: low (writing from the style
  spec; reviewed by the driver).
- T4 Beats per D4; tests for runs, lead changes, clutch window, quarter summaries on a
  synthetic theater. Tier: mid.
- T5 GameView playback per D6 and D7; screenshot of a quarter summary and a run line.
  Tier: mid.
- T6 Remove `narrativeText` production from the engine after T5 ships and D7 fallback is
  verified in the app. Tier: low.

## Parallelization

- Wave 0 (driver, 20 min): write `src/narration/types.ts` with the `narrative` shape, the
  renderer signature, the template file format and the `Beat` union as contracts.
- Wave 1 (parallel): T1 (mid, `game.ts`), T2 (mid, `render.ts`), T3 (low, templates),
  T4 (mid, `beats.ts`). All disjoint files; T2/T4 use the contract types.
- Wave 2: T5 (mid) once T2 and T4 exist.
- Wave 3: T6 (low).

## Recommended model tier

Main driver: Sonnet 5 / Gemini 3 Pro. Agents: Sonnet 5 / Gemini 3 Pro for T1, T2, T4,
T5; Haiku 4.5 / Gemini 3 Flash for T3 (volume text from a spec) and T6. Opus is not
needed unless the D1 shape needs redesign.

## Verification / exit criteria

- `npm test` green with the new narration tests; engine purity test passes.
- Play a full game in the app: every possession renders text, play names appear on
  called possessions, at least one run and one quarter summary appear, speed control and
  auto-scroll work; screenshots captured.
- Load a season saved before this plan: it still plays through (D7).
