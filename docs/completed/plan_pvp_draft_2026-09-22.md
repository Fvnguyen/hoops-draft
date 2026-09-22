# Plan: pvp_draft

File: `docs/plans/plan_pvp_draft_2026-09-22.md`. Status: done 2026-09-22.
Sequence: 16 in `docs/ROADMAP.md`. Depends on: `draft_resume`, `pvp_match`.
Files owned (under `frontend/src/` unless noted): `engine/draftReplay.ts`, `engine/balance.ts`
(`PVP_PICK_SECONDS`, `PVP_AUTOPICK_PROFILE` only), `hooks/useDraftEngine.ts`, `hooks/usePvpDraft.ts` (new),
`components/DraftRoom.tsx`, `components/DraftSidebar.tsx`, `components/DeckBuilder.tsx` (lock wiring only),
`app/playoffs/[id]/draft/page.tsx` (new), `app/playoffs/[id]/build/page.tsx` (new),
`components/playoffs/WaitingFor.tsx` (new), `tests/unit/pvp-draft.test.ts` (new), `tests/pvp-draft.spec.ts` (new).

## Goal

Two humans draft the same cube live from opposite seats with six bots between them, each on their own
device, and both build a roster from their 21 cards without seeing anything of the other. Every state is
a pure replay of `(seed, host picks, guest picks)`, so both devices always show the same room and a
reload lands back in it.

## Decisions (locked)

- D1. Room state is `replayDraft(seed, { 'human-0': host_picks, 'human-4': guest_picks })` from
  `draft_resume` D1, driven by the `matches` row from `pvp_match`. `usePvpDraft(matchId)` wraps
  `useMatch` and `useDraftEngine`: the local seat is host or guest, the other human seat is a remote seat
  (not a bot, its picks come from the row). A local pick is applied optimistically and sent with
  `match_pick(index, cardId)`; if the RPC raises (version or sequencing), the room refetches and re-renders
  from the row.
- D2. Sequencing: a pick index advances only when both humans have picked it; bots pick instantly inside
  the replay. The player who picked first sees `WaitingFor` ("Waiting for <name>", clock, online/offline
  from the heartbeat) over the settled pack; nothing else moves.
- D3. Validation is client-side and symmetric: each client checks the opponent's pick is in the pack the
  replay says that seat held. A mismatch (impossible unless a client is tampered with) sets the match
  `void` via `match_expire`-style RPC `match_void(reason)` (added to `pvp_match` D2's set by this plan) and
  shows "This match was voided". The server only enforces order and participant.
- D4. Pick clock: `PVP_PICK_SECONDS = 45` (`balance.ts`). `match_pick` sets `pick_deadline = now() + 45 s`
  when it completes a pick index (both picked), so both clients read one server deadline. On expiry a
  client auto-picks for its own seat with `getBotPick` using `PVP_AUTOPICK_PROFILE` (a fixed neutral
  `BotProfile`, no rng noise) and logs `autoPicked: true`. 10 s after the deadline the other client may
  call `match_autopick(seat, index, cardId)` for the absent seat with the same deterministic card, so an
  absent player never blocks the room; the RPC accepts one such call per index.
- D5. Offline: a heartbeat gap of 45 s shows "offline" in `WaitingFor`; after 5 minutes offline the
  present player may "Finish the draft": remaining picks for the absent seat are auto-picked pick by pick
  through D4 as each deadline passes (no batch jump, the room stays replayable). The absent player's
  draft is still valid and they may build a roster on return.
- D6. Hidden information: the bot pick ticker never shows the other human's picks; the sidebar shows the
  local roster only; no card counts for the opponent. Pack contents are shown as today.
- D7. Flow: PvP uses the Quick visuals (no intro opener pause, no round summaries) with the D4 clock, so
  both rooms never wait on a local pause. `DraftMode` gains `'pvp'`; `GameMode` gains `'playoffs'`.
- D8. Deck building: `/playoffs/[id]/build` renders the normal `DeckBuilder` (no auto-fill, product rule);
  Save is "Lock roster" and calls `match_lock_roster(snapshot)`; after locking, `WaitingFor` until both are
  locked, then the row moves to `series` and the page routes to `/playoffs/[id]`. No build clock; the 7-day
  forfeit from `pvp_match` D8 applies. A locked roster cannot be edited (the sideboard is the only later change).
- D9. Resume: opening `/playoffs/[id]/draft` at any time rebuilds the room from the row (`draft_resume`
  D4's sheet is not shown; a PvP room resumes directly because the opponent may be waiting).

## Out of scope

Series, coin flip, sideboard, results (`pvp_series`). Spectators. Chat. Changing bot behaviour, pack
generation or pick-clock length for solo drafts. Voice/notification when it is your turn beyond the bell
(`pvp_match` D4).

## Tasks

- T1 (top). Contracts: `usePvpDraft` return type, `match_void` RPC (SQL added under `pvp_match`'s
  migration folder as `202609220002_match_void.sql`), `PVP_PICK_SECONDS`, `PVP_AUTOPICK_PROFILE`,
  `DraftMode 'pvp'`, `GameMode 'playoffs'`. Done: `tsc`.
- T2 (mid). Engine: two-human replay in `draftReplay.ts` (`awaiting` with two seats, autopick helper
  `pvpAutopick(state, seat)`), `tests/unit/pvp-draft.test.ts`: property test over 200 random interleavings
  of host/guest pick timing, both replays converge; autopick is deterministic across calls; a foreign card
  is rejected by the validator. Done: tests green, purity test green.
- T3 (mid). `usePvpDraft` + room page + `WaitingFor` + ticker filter + clock from the server deadline
  (D1-D7). Done: `tests/pvp-draft.spec.ts` part 1: two contexts draft 36 picks with the clock shortened
  by a test-only query param, both rooms show identical packs at three sampled picks, one context goes
  offline and the other finishes via D5.
- T4 (mid). Build page and lock flow (D8, D9). Done: spec part 2: both lock, both route to `/playoffs/[id]`
  with `status = series`; a reload mid-draft resumes.
- T5 (low). `docs/game_mechanics.md` Playoffs draft section. Done: doc diff only.

## Parallelization

Wave 0: T1 (driver). Wave 1: T2 and T3 in parallel (engine + unit test vs hook/UI; T3 codes against T1's
stub and T2's signatures). Wave 2: T4. Wave 3: T5. Agents never run git or touch Supabase.

## Recommended model tier

Driver top (Fable 5.1 / Gemini 3 Pro): the sequencing and autopick rules are where two devices can
disagree. T2-T4 mid (Sonnet 5 / Gemini 3 Pro), T5 low (Haiku 4.5 / Gemini 3 Flash).

## Verification / exit criteria

`npm test` green; `tests/pvp-draft.spec.ts` green with two contexts at `--workers=1`, including the
offline finish; `tests/draft.spec.ts` and `visual.spec.ts` zero diff (solo draft untouched); `tsc`, `lint`
0 errors, `check:styles` 0; bench checksum 219438687; phone audit at `--project=phone-landscape` of the
room and `WaitingFor`, 0 findings; owner plays one full PvP draft against a second account on the phone
and the desktop before `/roadmap done`.
