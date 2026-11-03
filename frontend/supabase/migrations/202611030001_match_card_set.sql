-- season_2026_27 plan (T6, D9): a Playoffs match records the card set it was started on.
--
-- A weekly card-set refresh must never change a live PvP draft: both clients replay the
-- cube from (seed, picks) over a card set, and a replay over a different set rejects a
-- legal pick and voids the match. `card_set_version` pins it; NULL = every match created
-- before this column, i.e. the legacy set `2025-26.2` (`LEGACY_CARD_SET_VERSION` in
-- frontend/src/engine/cardSets.ts).
--
-- SAFE TO APPLY WHILE THE PREVIOUS CLIENT IS STILL DEPLOYED: adds one nullable column, and
-- match_invite gains a trailing parameter with DEFAULT NULL, so the deployed client's
-- `rpc('match_invite', { p_guest_id })` still resolves (and records NULL = legacy, which is
-- exactly the set that client ships). The return type is unchanged.
--
-- NOT the other way round: a client that sends `p_card_set_version` needs this migration
-- applied first (PostgREST finds no function with that argument name otherwise).
--
-- The function is dropped and re-created rather than `create or replace`d: adding a
-- parameter makes a new overload, and two overloads `(uuid)` and `(uuid, text default
-- null)` would make a one-argument call ambiguous. Body, security definer, search_path and
-- grants are copied from 202609220001_matches.sql; only the insert changed.

begin;

alter table public.matches add column if not exists card_set_version text;

comment on column public.matches.card_set_version is
  'Card set (CARD_SET_VERSION) the match was started on; NULL = 2025-26.2 (legacy).';

drop function if exists public.match_invite(uuid);

create function public.match_invite(p_guest_id uuid, p_card_set_version text default null)
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
  -- Versions look like '2026-27.12'; anything long is not one.
  if p_card_set_version is not null and (length(p_card_set_version) = 0 or length(p_card_set_version) > 32) then
    raise exception 'bad_argument: card set version must be 1 to 32 characters';
  end if;

  v_id := 'match_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  begin
    insert into public.matches (id, seed, host_id, guest_id, status, card_set_version)
    values (v_id, floor(random() * 2147483647)::int, v_host, p_guest_id, 'invited', p_card_set_version)
    returning * into v_row;
  exception when unique_violation then
    -- Either the (host,guest) pair already has a pending invite (the partial unique index
    -- matches_one_invite_per_pair), or the random id collided (astronomically unlikely).
    -- Both are reported the same way, same as cas_upsert's broad unique_violation handling.
    raise exception 'duplicate_invite: an invite already exists between these users';
  end;

  return v_row;
end;
$$;

revoke all on function public.match_invite(uuid, text) from public, anon;
grant execute on function public.match_invite(uuid, text) to authenticated;

-- PostgREST caches function signatures; make it see the new one at commit.
notify pgrst, 'reload schema';

commit;
