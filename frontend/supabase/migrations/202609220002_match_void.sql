-- pvp_draft plan (T1, D3/D4): void a tampered match, and no pick clock before anyone picks.
--
-- SAFE TO APPLY WHILE THE PREVIOUS CLIENT IS STILL DEPLOYED: adds one nullable column and one
-- function, and redefines match_respond/match_pick with unchanged signatures and return types.
--
-- Clock change: 202609220001 started the 45 s clock when the guest accepted, but the host may
-- not have the room open yet, so pick 1 was auto-picked the moment they arrived. Accepting
-- now leaves pick_deadline NULL; the first player to make a pick starts the other side's
-- 45 s. Every later pick keeps D4: the deadline is set when both have made the previous one.
-- 45 s mirrors PVP_PICK_SECONDS in frontend/src/engine/balance.ts.

begin;

alter table public.matches add column if not exists void_reason text;

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

  update public.matches
  set status = case when p_accept then 'drafting' else 'declined' end,
      pick_deadline = null,
      version = version + 1
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

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
  v_done boolean;
  v_deadline timestamptz;
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
  if v_my_len > v_their_len then
    raise exception 'bad_sequence: cannot pick more than one ahead of the opponent';
  end if;

  v_my_picks := v_my_picks || to_jsonb(p_card_id);
  v_done := jsonb_array_length(v_my_picks) = 24 and v_their_len = 24;
  v_deadline := case
    when v_done then null
    when v_their_len > p_index then now() + interval '45 seconds'           -- completes this pick
    when v_row.pick_deadline is null then now() + interval '45 seconds'     -- first to pick 1
    else v_row.pick_deadline
  end;

  if v_side = 'host' then
    update public.matches m
    set host_picks = v_my_picks,
        host_autopicks = case when p_auto then m.host_autopicks || to_jsonb(p_index) else m.host_autopicks end,
        status = case when v_done then 'building' else m.status end,
        pick_deadline = v_deadline,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  else
    update public.matches m
    set guest_picks = v_my_picks,
        guest_autopicks = case when p_auto then m.guest_autopicks || to_jsonb(p_index) else m.guest_autopicks end,
        status = case when v_done then 'building' else m.status end,
        pick_deadline = v_deadline,
        version = m.version + 1
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- D3: a client whose replay rejects the opponent's pick voids the match. The server cannot
-- check pick contents (it has no cube), only who may call this and when.
create or replace function public.match_void(p_id text, p_version int, p_reason text)
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
  if public._match_side(v_row.host_id, v_row.guest_id, v_uid) is null then
    raise exception 'not_participant: caller is not in this match';
  end if;
  if v_row.version <> p_version then
    raise exception 'version_mismatch: expected % got %', p_version, v_row.version;
  end if;
  if v_row.status not in ('drafting', 'building') then
    raise exception 'bad_status: only a drafting or building match can be voided';
  end if;

  update public.matches
  set status = 'void', void_reason = left(coalesce(p_reason, ''), 500), pick_deadline = null,
      version = version + 1
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.match_respond(text, int, boolean) from public, anon;
grant execute on function public.match_respond(text, int, boolean) to authenticated;
revoke all on function public.match_pick(text, int, int, text, boolean) from public, anon;
grant execute on function public.match_pick(text, int, int, text, boolean) to authenticated;
revoke all on function public.match_void(text, int, text) from public, anon;
grant execute on function public.match_void(text, int, text) to authenticated;

commit;
