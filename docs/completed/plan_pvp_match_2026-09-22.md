# Plan: pvp_match

File: `docs/plans/plan_pvp_match_2026-09-22.md`. Status: done 2026-09-22.
Sequence: 15 in `docs/ROADMAP.md`. Depends on: nothing (runs in parallel with `draft_resume`).
Files owned (under `frontend/` unless noted): `supabase/migrations/202609220001_matches.sql` (new),
`src/storage/matchTypes.ts` (new), `src/lib/matchChannel.ts` (new), `src/hooks/useMatch.ts` (new),
`src/hooks/useNotices.ts`, `src/app/api/match/[id]/simulate/route.ts` (new), `src/app/api/users/route.ts` (new),
`src/app/playoffs/new/page.tsx` (new), `src/components/playoffs/InviteList.tsx` (new), `scripts/bootstrap-e2e-user.mjs`,
`.env.example`, `tests/unit/match-*.test.ts` (new), `tests/playoffs-invite.spec.ts` (new).

## Goal

The shared record of a two-player "Playoffs" match: who plays, the seed, both pick lists, both rosters,
the games, and where the match stands. Invites come from a list of all users and are accepted from the
notification bell. Games are simulated on the server so neither client can invent a result. `pvp_draft`
and `pvp_series` build their screens on this record; this plan ships no draft and no series.

## Decisions (locked)

- D1. Table `public.matches`: `id text pk` (`match_<random>`), `seed int` (set by the DB on insert),
  `host_id uuid`, `guest_id uuid`, `status text` in `invited | declined | expired | drafting | building |
  series | sideboard | done | void | forfeit`, `host_picks jsonb` and `guest_picks jsonb` (card id arrays),
  `pick_deadline timestamptz`, `host_roster jsonb`, `guest_roster jsonb` (`SavedRoster` snapshots),
  `host_locked_at`, `guest_locked_at`, `sideboard jsonb` (`{ host?: {roster, trade?}, guest?: ... }`),
  `games jsonb` (slim results: game index, home side, seed, final score, box score), `host_seen jsonb`,
  `guest_seen jsonb` (`{ game: n, at }`), `host_seen_at`, `guest_seen_at` (heartbeat), `winner_id uuid`,
  `version int` (CAS), `created_at`, `updated_at`. Host is seat 0 (`human-0`), guest seat 4 (`human-4`).
- D2. Writes go only through security-definer RPCs, never direct updates: `match_invite(guest_id)`,
  `match_respond(id, accept)`, `match_pick(id, index, card_id)`, `match_autopick(id, seat, index, card_id)`
  (accepted only after `pick_deadline` + 10 s), `match_lock_roster(id, roster)`, `match_sideboard(id,
  roster, trade)`, `match_seen(id, game)`, `match_heartbeat(id)`, `match_expire(id)`. Each takes the
  expected `version` and raises on mismatch; each checks the caller is the right participant and the
  status allows the action. RLS: participants `select` their rows; approved users only; admins read all.
  Game results are written by the simulate route with the service role, not by clients.
- D3. User directory: view `public.user_directory` (`id, display_name, username`) over approved profiles,
  readable by approved users. `GET /api/users` returns it minus the caller. The invite page lists everyone
  (owner: friends list later, all users now); one pending invite per pair at a time.
- D4. Invites are notices: `useNotices` gains kind `'match-invite'` (from `matches` where `guest_id = me`
  and `status = 'invited'`) with Accept and Decline actions in the bell, plus `'match-turn'` (opponent
  picked, locked, or a game is ready) and `'match-done'`. Notices come from a `useMatchList()` query on
  load plus the channel in D5; no push notifications in this plan.
- D5. `lib/matchChannel.ts`: Supabase Realtime `postgres_changes` on `matches` filtered by id, through
  the lazy client; if the channel is not `SUBSCRIBED` within 5 s, poll `select` every 3 s instead and say
  so in `useMatch(id).transport`. `useMatch` returns `{ match, me: 'host' | 'guest', transport, send }`
  where `send` calls the D2 RPCs with the current version and retries once on a version mismatch after a
  refetch.
- D6. Heartbeat: `match_heartbeat` every 15 s while a match page is open; the opponent counts as offline
  after 45 s without one. Only informational here; `pvp_draft` acts on it.
- D7. Simulation: `POST /api/match/[id]/simulate` with `{ game }`; caller must be a participant; the route
  loads the row with the service role, refuses unless `status` is `series` and `games.length === game`,
  simulates `simulateGame` with the tournament tuning (never `CHALLENGE_TUNING`), seed
  `mixSeed(seed, 'game:<game>')`, home side from `pvp_series` D1's `homeFor(game, coinFlip)`, stores the
  slim result under version CAS, and is idempotent (a second call returns the stored game). Node runtime,
  not edge. Which roster plays: the sideboard snapshot when present for that side, else the locked one.
- D8. Expiry: `match_expire` marks `invited` older than 7 days `expired`, and any status waiting on a
  player for more than 7 days `forfeit` with `winner_id` = the other player. The simulate route and
  `useMatchList` call it on read; no cron.
- D9. Migration applied to production only with the owner in manual approval mode after a rolled-back
  dry run, as `sync_outbox` did. Second E2E account: `bootstrap:e2e` also creates `E2E_TEST_EMAIL_2`
  (`.env.example`), because every PvP spec needs two logged-in contexts.

## Out of scope

The draft room and pick validation (`pvp_draft`). Series rules, coin flip, sideboard screen, results
(`pvp_series`). Friends list, blocking, public lobby, push notifications, spectators. Rematch (series).

## Tasks

- T1 (top). Contracts: `storage/matchTypes.ts` (`Match`, `MatchStatus`, `MatchSide`, `MatchGame`,
  `MatchAction`), the migration's RPC signatures as a comment block, `useMatch` return type. Done: `tsc`.
- T2 (mid). Migration + RPCs + RLS + `user_directory`, and a SQL test script run against a local/branch DB
  in a transaction that is rolled back (invite, accept, pick sequencing, version mismatch raises, wrong
  participant raises, expiry). Done: script output quoted, all cases pass.
- T3 (mid). `matchChannel.ts`, `useMatch.ts`, `useMatchList`, unit tests with a mocked client (subscribe,
  fallback to polling after 5 s, CAS retry once). Done: `tests/unit/match-channel.test.ts` green.
- T4 (mid). `/api/users`, `/playoffs/new` invite list, `useNotices` invite/turn/done kinds with Accept and
  Decline in the bell, `tests/playoffs-invite.spec.ts` with two browser contexts (user A invites B, B accepts
  from the bell, both see `drafting`). Done: spec green at `--workers=1`.
- T5 (mid). Simulate route + a unit test that calls the handler with a seeded fixture match (idempotent,
  refuses wrong status, result reproducible from the seed). Done: `tests/unit/match-simulate.test.ts`.
- T6 (top, owner present). Apply the migration to production (D9). Done: dry run rolled back, then applied,
  `select count(*) from matches` returns 0.

## Parallelization

Wave 0: T1 (driver). Wave 1: T2, T3 in parallel (SQL vs client lib). Wave 2: T4, T5 in parallel (UI vs
route; T5 uses T2's schema locally). Wave 3: T6 with the owner. Agents never run git or touch Supabase.

## Recommended model tier

Driver top (Fable 5.1 / Gemini 3 Pro): schema and RLS are security-relevant. T2-T5 mid (Sonnet 5 /
Gemini 3 Pro). Nothing low: every task here either touches auth boundaries or a shared contract.

## Verification / exit criteria

SQL test script all cases pass (quoted); `npm test` green; `tests/playoffs-invite.spec.ts` green with two
contexts; `tsc`, `lint` 0 errors, `check:styles` 0; `node scripts/route-js-size.mjs`: `/` first-load JS
does not grow by more than 3 KB gz (the channel loads lazily with the client); production migration applied
and verified with the owner. Engine bench checksum 219438687 unchanged (no engine edits).
