-- pvp_match plan (T2): the shared two-player "Playoffs" match record (D1/D2/D3/D8).
--
-- SAFE TO APPLY WHILE THE PREVIOUS CLIENT IS STILL DEPLOYED: this migration only adds
-- objects (a new table, new functions, a new view). No existing table, column, function
-- signature or policy is touched.
--
-- Contract: `frontend/src/storage/matchTypes.ts` is authoritative for the column list and
-- the RPC signatures/semantics; this file implements it. Host is seat 0 (`human-0`), guest
-- seat 4 (`human-4`) — that mapping lives client-side only, not in this schema.

begin;

-- ── table ────────────────────────────────────────────────────────────────

create table public.matches (
  id text primary key,
  seed int not null,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in (
    'invited', 'declined', 'expired', 'drafting', 'building', 'series', 'sideboard',
    'done', 'void', 'forfeit'
  )),
  host_picks jsonb not null default '[]',
  guest_picks jsonb not null default '[]',
  host_autopicks jsonb not null default '[]',
  guest_autopicks jsonb not null default '[]',
  pick_deadline timestamptz,
  host_roster jsonb,
  guest_roster jsonb,
  host_locked_at timestamptz,
  guest_locked_at timestamptz,
  sideboard jsonb not null default '{}',
  games jsonb not null default '[]',
  host_seen jsonb,
  guest_seen jsonb,
  host_seen_at timestamptz,
  guest_seen_at timestamptz,
  winner_id uuid references auth.users(id),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_host_id_idx on public.matches (host_id);
create index matches_guest_id_idx on public.matches (guest_id);
create index matches_status_idx on public.matches (status);

create trigger matches_updated_at
  before update on public.matches
  for each row execute procedure public.set_updated_at();

-- D1: one `invited` row per unordered pair. A later insert for the same pair while one is
-- still pending hits this index and is mapped to `duplicate_invite` by match_invite below.
create unique index matches_one_invite_per_pair
  on public.matches (least(host_id, guest_id), greatest(host_id, guest_id))
  where status = 'invited';

alter table public.matches enable row level security;

create policy "participants read their matches"
  on public.matches for select
  using (
    (select auth.uid()) in (host_id, guest_id)
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'APPROVED')
  );

create policy "admins read all matches"
  on public.matches for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'ADMIN'));

-- D2: no insert/update/delete policy for clients on purpose. Every write goes through a
-- security-definer RPC below (which bypasses RLS as the function owner); the simulate API
-- route writes `games` with the service role, which also bypasses RLS.
revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;

-- ── helpers (not part of the public RPC contract) ───────────────────────────

create or replace function public._match_require_approved(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_uid is null or not exists (
    select 1 from public.profiles p where p.id = p_uid and p.status = 'APPROVED'
  ) then
    raise exception 'not_approved: caller is not an approved user';
  end if;
end;
$$;

create or replace function public._match_side(p_host uuid, p_guest uuid, p_uid uuid)
returns text
language sql
immutable
as $$
  select case when p_uid = p_host then 'host' when p_uid = p_guest then 'guest' else null end;
$$;

-- Internal only: Supabase's default privileges would otherwise expose both through
-- PostgREST (`_match_require_approved` as an "is this uuid approved" oracle). The
-- security-definer RPCs call them as the function owner, which keeps its execute right.
revoke all on function public._match_require_approved(uuid) from public, anon, authenticated;
revoke all on function public._match_side(uuid, uuid, uuid) from public, anon, authenticated;

-- ── user_directory (D3) ──────────────────────────────────────────────────

-- Views run with the privileges of their owner over the underlying table, so this is
-- readable in full even though `profiles` RLS only lets a caller select their own row.
-- The exists() clause below is the gate: only an approved caller sees any rows at all.
create view public.user_directory as
select p.id, p.display_name, p.username
from public.profiles p
where p.status = 'APPROVED'
  and exists (
    select 1 from public.profiles caller
    where caller.id = (select auth.uid()) and caller.status = 'APPROVED'
  );

revoke all on public.user_directory from anon, authenticated;
grant select on public.user_directory to authenticated;

-- ── RPCs (D2) ────────────────────────────────────────────────────────────
-- Every RPC here is `security definer set search_path = public`, requires an APPROVED
-- caller, and (except match_heartbeat/match_expire) checks the row `version` and bumps it
-- by 1 on success. Errors are `raise exception '<code>: <detail>'`; codes are the
-- `MatchErrorCode` union in matchTypes.ts.

create or replace function public.match_invite(p_guest_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid := (select auth.uid());
  v_row public.matches;
  v_id text;
begin
  perform public._match_require_approved(v_host);

  if p_guest_id is null or p_guest_id = v_host then
    raise exception 'bad_argument: guest must be a different approved user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_guest_id and p.status = 'APPROVED') then
    raise exception 'bad_argument: guest is not an approved user';
  end if;

  v_id := 'match_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  begin
    insert into public.matches (id, seed, host_id, guest_id, status)
    values (v_id, floor(random() * 2147483647)::int, v_host, p_guest_id, 'invited')
    returning * into v_row;
  exception when unique_violation then
    -- Either the (host,guest) pair already has a pending invite (the partial unique index
    -- above), or the random id collided (astronomically unlikely). Both are reported the
    -- same way, same as cas_upsert's broad unique_violation handling elsewhere.
    raise exception 'duplicate_invite: an invite already exists between these users';
  end;

  return v_row;
end;
$$;

revoke all on function public.match_invite(uuid) from public, anon;
grant execute on function public.match_invite(uuid) to authenticated;

create or replace function public.match_respond(p_id text, p_version int, p_accept boolean)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
begin
  perform public._match_require_approved(v_uid);

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;
  if v_uid <> v_row.guest_id then
    raise exception 'not_participant: caller is not the invited guest';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status <> 'invited' then
    raise exception 'bad_status: match is not awaiting a response';
  end if;

  if p_accept then
    update public.matches
    set status = 'drafting', pick_deadline = now() + interval '45 seconds', version = version + 1
    where id = p_id
    returning * into v_row;
  else
    update public.matches
    set status = 'declined', version = version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.match_respond(text, int, boolean) from public, anon;
grant execute on function public.match_respond(text, int, boolean) to authenticated;

create or replace function public.match_pick(p_id text, p_version int, p_index int, p_card_id text, p_auto boolean default false)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_side text;
  v_my_picks jsonb;
  v_their_len int;
  v_my_len int;
begin
  perform public._match_require_approved(v_uid);

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_side is null then
    raise exception 'not_participant: caller is not in this match';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status <> 'drafting' then
    raise exception 'bad_status: match is not drafting';
  end if;

  if v_side = 'host' then
    v_my_picks := v_row.host_picks;
    v_their_len := jsonb_array_length(v_row.guest_picks);
  else
    v_my_picks := v_row.guest_picks;
    v_their_len := jsonb_array_length(v_row.host_picks);
  end if;
  v_my_len := jsonb_array_length(v_my_picks);

  if p_index <> v_my_len then
    raise exception 'bad_sequence: expected pick index %, got %', v_my_len, p_index;
  end if;
  -- "nobody runs more than one pick ahead": before appending, my count must not already
  -- exceed the opponent's — otherwise this pick would put me two ahead.
  if v_my_len > v_their_len then
    raise exception 'bad_sequence: cannot pick more than one ahead of the opponent';
  end if;

  v_my_picks := v_my_picks || to_jsonb(p_card_id);

  if v_side = 'host' then
    update public.matches m
    set host_picks = v_my_picks,
        host_autopicks = case when p_auto then m.host_autopicks || to_jsonb(p_index) else m.host_autopicks end,
        status = case when jsonb_array_length(v_my_picks) = 24 and v_their_len = 24 then 'building' else m.status end,
        pick_deadline = case
          when jsonb_array_length(v_my_picks) = 24 and v_their_len = 24 then null
          when v_their_len > p_index then now() + interval '45 seconds'
          else m.pick_deadline
        end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  else
    update public.matches m
    set guest_picks = v_my_picks,
        guest_autopicks = case when p_auto then m.guest_autopicks || to_jsonb(p_index) else m.guest_autopicks end,
        status = case when jsonb_array_length(v_my_picks) = 24 and v_their_len = 24 then 'building' else m.status end,
        pick_deadline = case
          when jsonb_array_length(v_my_picks) = 24 and v_their_len = 24 then null
          when v_their_len > p_index then now() + interval '45 seconds'
          else m.pick_deadline
        end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.match_pick(text, int, int, text, boolean) from public, anon;
grant execute on function public.match_pick(text, int, int, text, boolean) to authenticated;

create or replace function public.match_autopick(p_id text, p_version int, p_seat text, p_index int, p_card_id text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_caller_side text;
  v_seat_picks jsonb;
  v_other_len int;
begin
  perform public._match_require_approved(v_uid);

  if p_seat not in ('host', 'guest') then
    raise exception 'bad_argument: p_seat must be host or guest';
  end if;

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_caller_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_caller_side is null or v_caller_side = p_seat then
    raise exception 'not_participant: caller must be the other side of %', p_seat;
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status <> 'drafting' then
    raise exception 'bad_status: match is not drafting';
  end if;
  if v_row.pick_deadline is null or now() <= v_row.pick_deadline + interval '10 seconds' then
    raise exception 'too_early: pick clock has not expired';
  end if;

  if p_seat = 'host' then
    v_seat_picks := v_row.host_picks;
    v_other_len := jsonb_array_length(v_row.guest_picks);
  else
    v_seat_picks := v_row.guest_picks;
    v_other_len := jsonb_array_length(v_row.host_picks);
  end if;

  if p_index <> jsonb_array_length(v_seat_picks) then
    raise exception 'bad_sequence: expected pick index %, got %', jsonb_array_length(v_seat_picks), p_index;
  end if;

  v_seat_picks := v_seat_picks || to_jsonb(p_card_id);

  if p_seat = 'host' then
    update public.matches m
    set host_picks = v_seat_picks,
        host_autopicks = m.host_autopicks || to_jsonb(p_index),
        status = case when jsonb_array_length(v_seat_picks) = 24 and v_other_len = 24 then 'building' else m.status end,
        pick_deadline = case
          when jsonb_array_length(v_seat_picks) = 24 and v_other_len = 24 then null
          when v_other_len > p_index then now() + interval '45 seconds'
          else m.pick_deadline
        end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  else
    update public.matches m
    set guest_picks = v_seat_picks,
        guest_autopicks = m.guest_autopicks || to_jsonb(p_index),
        status = case when jsonb_array_length(v_seat_picks) = 24 and v_other_len = 24 then 'building' else m.status end,
        pick_deadline = case
          when jsonb_array_length(v_seat_picks) = 24 and v_other_len = 24 then null
          when v_other_len > p_index then now() + interval '45 seconds'
          else m.pick_deadline
        end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.match_autopick(text, int, text, int, text) from public, anon;
grant execute on function public.match_autopick(text, int, text, int, text) to authenticated;

create or replace function public.match_lock_roster(p_id text, p_version int, p_roster jsonb)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_side text;
  v_other_locked boolean;
begin
  perform public._match_require_approved(v_uid);

  if pg_column_size(p_roster) > 1048576 then
    raise exception 'bad_argument: roster snapshot over 1 MiB';
  end if;

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_side is null then
    raise exception 'not_participant: caller is not in this match';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status <> 'building' then
    raise exception 'bad_status: match is not building';
  end if;

  if v_side = 'host' then
    if v_row.host_locked_at is not null then
      raise exception 'bad_status: roster already locked';
    end if;
    v_other_locked := v_row.guest_locked_at is not null;
    update public.matches m
    set host_roster = p_roster, host_locked_at = now(),
        status = case when v_other_locked then 'series' else m.status end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  else
    if v_row.guest_locked_at is not null then
      raise exception 'bad_status: roster already locked';
    end if;
    v_other_locked := v_row.host_locked_at is not null;
    update public.matches m
    set guest_roster = p_roster, guest_locked_at = now(),
        status = case when v_other_locked then 'series' else m.status end,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.match_lock_roster(text, int, jsonb) from public, anon;
grant execute on function public.match_lock_roster(text, int, jsonb) to authenticated;

create or replace function public.match_sideboard(p_id text, p_version int, p_roster jsonb, p_trade jsonb)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_side text;
  v_other_side text;
  v_other_set boolean;
  v_entry jsonb;
begin
  perform public._match_require_approved(v_uid);

  if pg_column_size(p_roster) > 1048576 then
    raise exception 'bad_argument: roster snapshot over 1 MiB';
  end if;

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_side is null then
    raise exception 'not_participant: caller is not in this match';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status <> 'sideboard' then
    raise exception 'bad_status: match is not in the sideboard phase';
  end if;
  if v_row.sideboard ? v_side then
    raise exception 'bad_status: sideboard entry already set';
  end if;

  v_other_side := case when v_side = 'host' then 'guest' else 'host' end;
  v_other_set := v_row.sideboard ? v_other_side;
  v_entry := jsonb_build_object('roster', p_roster, 'trade', p_trade, 'lockedAt', to_jsonb(now()));

  update public.matches m
  set sideboard = jsonb_set(m.sideboard, array[v_side], v_entry, true),
      status = case when v_other_set then 'series' else m.status end,
      version = m.version + 1
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.match_sideboard(text, int, jsonb, jsonb) from public, anon;
grant execute on function public.match_sideboard(text, int, jsonb, jsonb) to authenticated;

create or replace function public.match_seen(p_id text, p_version int, p_game int)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_side text;
begin
  perform public._match_require_approved(v_uid);

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_side is null then
    raise exception 'not_participant: caller is not in this match';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status in ('declined', 'expired', 'done', 'void', 'forfeit') then
    raise exception 'bad_status: match is over';
  end if;

  if v_side = 'host' then
    update public.matches m
    set host_seen = jsonb_build_object('game', p_game, 'at', to_jsonb(now())), version = m.version + 1
    where id = p_id
    returning * into v_row;
  else
    update public.matches m
    set guest_seen = jsonb_build_object('game', p_game, 'at', to_jsonb(now())), version = m.version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.match_seen(text, int, int) from public, anon;
grant execute on function public.match_seen(text, int, int) to authenticated;

-- D6: heartbeat while a match page is open. No version arg, no version bump on purpose —
-- a heartbeat racing a real action (pick, lock, ...) must never fail or bump the CAS token.
create or replace function public.match_heartbeat(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches;
  v_side text;
begin
  perform public._match_require_approved(v_uid);

  select * into v_row from public.matches where id = p_id for update;
  if not found then
    raise exception 'not_participant: match not found';
  end if;

  v_side := public._match_side(v_row.host_id, v_row.guest_id, v_uid);
  if v_side is null then
    raise exception 'not_participant: caller is not in this match';
  end if;

  if v_side = 'host' then
    update public.matches set host_seen_at = now() where id = p_id;
  else
    update public.matches set guest_seen_at = now() where id = p_id;
  end if;
end;
$$;

revoke all on function public.match_heartbeat(text) from public, anon;
grant execute on function public.match_heartbeat(text) to authenticated;

-- D8: expiry/forfeit sweep, over one match (p_id) or every match the caller participates in
-- (p_id null). No version arg: this runs opportunistically from the simulate route and
-- useMatchList, and always wins over a stale client CAS token.
--
-- "invited" older than 7 days (by created_at) -> 'expired', no winner.
--
-- Any other non-terminal status whose row has been idle (updated_at) for 7+ days ->
-- 'forfeit', winner_id = the OTHER side. Which side is "awaited" (the one forfeited)
-- depends on the status, per the plan:
--   drafting  : the side with fewer picks. Picks equal -> no side is behind on picks, so
--               fall back to whichever side's heartbeat (*_seen_at) is older or null.
--   building  : the side that has not locked a roster. If both are unlocked (can happen:
--               building starts as soon as both finish drafting), same *_seen_at fallback.
--   sideboard : the side with no sideboard entry yet. Both missing -> same fallback.
--   series    : the side whose *_seen.game is behind (a missing *_seen counts as game 0).
--               Equal -> same fallback.
-- The *_seen_at fallback treats a null heartbeat as older than any real timestamp (epoch),
-- so a player who never opened the match page at all is the one forfeited.
create or replace function public.match_expire(p_id text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cutoff timestamptz := now() - interval '7 days';
  r public.matches;
  v_awaited text;
  v_changed int := 0;
  v_h_len int;
  v_g_len int;
  v_h_game int;
  v_g_game int;
begin
  perform public._match_require_approved(v_uid);

  if p_id is not null and not exists (
    select 1 from public.matches m where m.id = p_id and v_uid in (m.host_id, m.guest_id)
  ) then
    raise exception 'not_participant: caller is not a participant of match %', p_id;
  end if;

  for r in
    select * from public.matches m
    where (p_id is not null and m.id = p_id)
       or (p_id is null and v_uid in (m.host_id, m.guest_id))
    for update
  loop
    if r.status = 'invited' then
      if r.created_at < v_cutoff then
        update public.matches set status = 'expired', version = version + 1 where id = r.id;
        v_changed := v_changed + 1;
      end if;
      continue;
    end if;

    if r.status in ('declined', 'expired', 'done', 'void', 'forfeit') then
      continue;
    end if;

    if r.updated_at >= v_cutoff then
      continue;
    end if;

    v_awaited := null;

    if r.status = 'drafting' then
      v_h_len := jsonb_array_length(r.host_picks);
      v_g_len := jsonb_array_length(r.guest_picks);
      if v_h_len < v_g_len then
        v_awaited := 'host';
      elsif v_g_len < v_h_len then
        v_awaited := 'guest';
      elsif coalesce(r.host_seen_at, 'epoch'::timestamptz) <= coalesce(r.guest_seen_at, 'epoch'::timestamptz) then
        v_awaited := 'host';
      else
        v_awaited := 'guest';
      end if;
    elsif r.status = 'building' then
      if r.host_locked_at is null and r.guest_locked_at is not null then
        v_awaited := 'host';
      elsif r.guest_locked_at is null and r.host_locked_at is not null then
        v_awaited := 'guest';
      elsif r.host_locked_at is null and r.guest_locked_at is null then
        if coalesce(r.host_seen_at, 'epoch'::timestamptz) <= coalesce(r.guest_seen_at, 'epoch'::timestamptz) then
          v_awaited := 'host';
        else
          v_awaited := 'guest';
        end if;
      end if;
    elsif r.status = 'sideboard' then
      if (r.sideboard ? 'host') and not (r.sideboard ? 'guest') then
        v_awaited := 'guest';
      elsif (r.sideboard ? 'guest') and not (r.sideboard ? 'host') then
        v_awaited := 'host';
      elsif not (r.sideboard ? 'host') and not (r.sideboard ? 'guest') then
        if coalesce(r.host_seen_at, 'epoch'::timestamptz) <= coalesce(r.guest_seen_at, 'epoch'::timestamptz) then
          v_awaited := 'host';
        else
          v_awaited := 'guest';
        end if;
      end if;
    elsif r.status = 'series' then
      v_h_game := coalesce((r.host_seen ->> 'game')::int, 0);
      v_g_game := coalesce((r.guest_seen ->> 'game')::int, 0);
      if v_h_game < v_g_game then
        v_awaited := 'host';
      elsif v_g_game < v_h_game then
        v_awaited := 'guest';
      elsif coalesce(r.host_seen_at, 'epoch'::timestamptz) <= coalesce(r.guest_seen_at, 'epoch'::timestamptz) then
        v_awaited := 'host';
      else
        v_awaited := 'guest';
      end if;
    end if;

    if v_awaited is not null then
      update public.matches
      set status = 'forfeit',
          winner_id = case when v_awaited = 'host' then r.guest_id else r.host_id end,
          version = version + 1
      where id = r.id;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return v_changed;
end;
$$;

revoke all on function public.match_expire(text) from public, anon;
grant execute on function public.match_expire(text) to authenticated;

-- ── realtime (D5) ────────────────────────────────────────────────────────
-- Guarded: a local/branch database without the supabase_realtime publication (e.g. a plain
-- Postgres test harness) must not fail this migration.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
    ) then
      alter publication supabase_realtime add table public.matches;
    end if;
  end if;
end;
$$;

commit;
