-- Test script for 202609220001_matches.sql.
--
-- One transaction, rolled back at the end: safe to run against a real (including
-- production, per the owner's dry-run process) database — nothing it does survives the
-- `rollback`. Assumes NO existing rows: it creates its own throwaway auth users/profiles
-- and only ever touches matches it created itself.
--
-- Impersonation: `auth.uid()` (used by every RPC and by the matches RLS policies) reads
-- `current_setting('request.jwt.claims', true)::json->>'sub'`. `pg_temp.impersonate(uuid)`
-- below sets that GUC and switches to the `authenticated` role; `pg_temp.deauth()` goes
-- back to the session's own role (postgres/superuser locally, or whatever ran this script)
-- so RLS and the RPCs' own checks stop applying — needed to backdate timestamps and to
-- move `pick_deadline` into the past for the autopick test, exactly like the owner would
-- need to poke the table directly during the dry run.

begin;

-- A procedure (not a function) so it can run SET LOCAL directly: every impersonation both
-- switches to the `authenticated` role (so RLS/grants apply) AND sets the JWT claims GUC
-- auth.uid() reads. `deauth()` undoes both, back to this script's own role (postgres,
-- typically a superuser that bypasses RLS) — used for the direct table pokes below (moving
-- pick_deadline / created_at / updated_at into the past) that no client RPC exposes.
create procedure pg_temp.impersonate(p_uid uuid)
language plpgsql
as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create procedure pg_temp.deauth()
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────────
-- Four throwaway users: host, guest and a bystander are APPROVED; d_pending stays PENDING.
-- auth.users columns match what Supabase seed scripts commonly insert; handle_new_user
-- (from 202609130002_add_username.sql) fires on insert and creates the matching profiles
-- row, PENDING, which we then flip to APPROVED for three of the four.

do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_bystander uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_host, 'authenticated', 'authenticated',
     'pvp-test-host@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Test Host', 'username', 'pvptesthost')::jsonb, now(), now(),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_guest, 'authenticated', 'authenticated',
     'pvp-test-guest@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Test Guest', 'username', 'pvptestguest')::jsonb, now(), now(),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_bystander, 'authenticated', 'authenticated',
     'pvp-test-bystander@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Test Bystander', 'username', 'pvptestbystander')::jsonb, now(), now(),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_pending, 'authenticated', 'authenticated',
     'pvp-test-pending@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Test Pending', 'username', 'pvptestpending')::jsonb, now(), now(),
     '', '', '', '');

  update public.profiles set status = 'APPROVED' where id in (v_host, v_guest, v_bystander);
  -- v_pending stays PENDING (the default from handle_new_user).

  -- Stash ids in a temp table so later DO blocks (each its own plpgsql scope) can read them.
  create temp table test_ids (key text primary key, id uuid not null);
  grant all on test_ids to authenticated;
  insert into test_ids (key, id) values
    ('host', v_host), ('guest', v_guest), ('bystander', v_bystander), ('pending', v_pending);

  raise notice 'PASS: fixtures created (host=%, guest=%, bystander=%, pending=%)', v_host, v_guest, v_bystander, v_pending;
end;
$$;

create temp table test_matches (key text primary key, id text not null);
grant all on test_matches to authenticated;

-- ── unapproved user cannot invite ───────────────────────────────────────────

do $$
declare
  v_pending uuid := (select id from test_ids where key = 'pending');
  v_host uuid := (select id from test_ids where key = 'host');
  v_failed boolean := false;
begin
  call pg_temp.impersonate(v_pending);
  begin
    perform public.match_invite(v_host);
  exception when others then
    if sqlerrm like 'not_approved:%' then
      v_failed := true;
    else
      raise exception 'FAIL: expected not_approved, got %', sqlerrm;
    end if;
  end;
  call pg_temp.deauth();
  if not v_failed then
    raise exception 'FAIL: unapproved user was allowed to invite';
  end if;
  raise notice 'PASS: unapproved user cannot invite';
end;
$$;

-- ── invite, duplicate invite, wrong-participant, non-participant select ────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_bystander uuid := (select id from test_ids where key = 'bystander');
  v_match public.matches;
  v_failed boolean := false;
  v_visible int;
begin
  call pg_temp.impersonate(v_host);

  v_match := public.match_invite(v_guest);
  if v_match.status <> 'invited' or v_match.host_id <> v_host or v_match.guest_id <> v_guest
     or v_match.version <> 1 or v_match.seed < 0 or v_match.id !~ '^match_' then
    raise exception 'FAIL: match_invite returned unexpected row %', row_to_json(v_match);
  end if;
  insert into test_matches (key, id) values ('m1', v_match.id);

  -- duplicate invite (same pair, either direction) raises
  begin
    perform public.match_invite(v_guest);
  exception when others then
    if sqlerrm like 'duplicate_invite:%' then
      v_failed := true;
    else
      raise exception 'FAIL: expected duplicate_invite, got %', sqlerrm;
    end if;
  end;
  if not v_failed then
    raise exception 'FAIL: duplicate invite was not rejected';
  end if;

  call pg_temp.deauth();

  -- a non-participant cannot even see the row
  call pg_temp.impersonate(v_bystander);
  select count(*) into v_visible from public.matches where id = v_match.id;
  if v_visible <> 0 then
    raise exception 'FAIL: bystander could select a match they are not in';
  end if;

  -- a non-participant calling a versioned RPC on it is rejected as not_participant
  v_failed := false;
  begin
    perform public.match_respond(v_match.id, v_match.version, true);
  exception when others then
    if sqlerrm like 'not_participant:%' then
      v_failed := true;
    else
      raise exception 'FAIL: expected not_participant, got %', sqlerrm;
    end if;
  end;
  if not v_failed then
    raise exception 'FAIL: bystander was allowed to respond to a match they are not in';
  end if;

  call pg_temp.deauth();
  raise notice 'PASS: invite, duplicate_invite, non-participant select and RPC rejection';
end;
$$;

-- ── version mismatch raises ─────────────────────────────────────────────────

do $$
declare
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_current_version int;
  v_failed boolean := false;
begin
  call pg_temp.impersonate(v_guest);
  select version into v_current_version from public.matches where id = v_match_id;

  begin
    perform public.match_respond(v_match_id, v_current_version + 1, true);
  exception when others then
    if sqlerrm like 'version_mismatch:%' then
      v_failed := true;
    else
      raise exception 'FAIL: expected version_mismatch, got %', sqlerrm;
    end if;
  end;
  call pg_temp.deauth();
  if not v_failed then
    raise exception 'FAIL: stale version was accepted';
  end if;
  raise notice 'PASS: version mismatch raises';
end;
$$;

-- ── decline path (on a second, disposable invite) ───────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_bystander uuid := (select id from test_ids where key = 'bystander');
  v_match public.matches;
begin
  call pg_temp.impersonate(v_bystander);
  v_match := public.match_invite(v_host);
  call pg_temp.deauth();

  call pg_temp.impersonate(v_host);
  v_match := public.match_respond(v_match.id, v_match.version, false);
  call pg_temp.deauth();

  if v_match.status <> 'declined' then
    raise exception 'FAIL: expected declined, got %', v_match.status;
  end if;
  raise notice 'PASS: decline path';
end;
$$;

-- ── accept -> drafting ───────────────────────────────────────────────────────

do $$
declare
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
begin
  call pg_temp.impersonate(v_guest);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_respond(v_match_id, v_match.version, true);
  call pg_temp.deauth();

  -- 202609220002: no clock until someone picks (the host may not have the room open yet).
  if v_match.status <> 'drafting' or v_match.pick_deadline is not null then
    raise exception 'FAIL: expected drafting with no pick_deadline, got status=% deadline=%', v_match.status, v_match.pick_deadline;
  end if;
  raise notice 'PASS: accept moves match to drafting, clock not started';
end;
$$;

-- ── pick sequencing: index must match, nobody runs two ahead ───────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
  v_failed boolean := false;
begin
  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;

  -- host picks index 0: fine
  v_match := public.match_pick(v_match_id, v_match.version, 0, 'card_h0');
  if jsonb_array_length(v_match.host_picks) <> 1 then
    raise exception 'FAIL: host pick 0 did not land';
  end if;
  -- 202609220002: the first pick of pick 1 starts the other side's clock.
  if v_match.pick_deadline is null then
    raise exception 'FAIL: the first pick did not start the clock';
  end if;

  -- wrong index (must be 1, tried 0 again)
  begin
    perform public.match_pick(v_match_id, v_match.version, 0, 'card_h_dup');
  exception when others then
    if sqlerrm like 'bad_sequence:%' then v_failed := true;
    else raise exception 'FAIL: expected bad_sequence for wrong index, got %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'FAIL: repeated pick index was accepted'; end if;

  -- correct index (1) but guest has not picked index 0 yet: would be two ahead
  v_failed := false;
  begin
    perform public.match_pick(v_match_id, v_match.version, 1, 'card_h1_early');
  exception when others then
    if sqlerrm like 'bad_sequence:%' then v_failed := true;
    else raise exception 'FAIL: expected bad_sequence for running ahead, got %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'FAIL: host was allowed to run two picks ahead'; end if;

  call pg_temp.deauth();

  -- guest catches up to index 0
  call pg_temp.impersonate(v_guest);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_pick(v_match_id, v_match.version, 0, 'card_g0');
  call pg_temp.deauth();

  -- now host can pick index 1 (their_len = 1 >= my_len = 1)
  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_pick(v_match_id, v_match.version, 1, 'card_h1');
  call pg_temp.deauth();

  if jsonb_array_length(v_match.host_picks) <> 2 then
    raise exception 'FAIL: host should have 2 picks, has %', jsonb_array_length(v_match.host_picks);
  end if;

  raise notice 'PASS: pick sequencing (index match + no running two ahead)';
end;
$$;

-- ── autopick: too_early, then accepted once the deadline is in the past ────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
  v_failed boolean := false;
begin
  -- guest is behind (host has 2 picks, guest has 1): host tries to autopick FOR guest
  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;

  begin
    perform public.match_autopick(v_match_id, v_match.version, 'guest', 1, 'card_g1_auto');
  exception when others then
    if sqlerrm like 'too_early:%' then v_failed := true;
    else raise exception 'FAIL: expected too_early, got %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'FAIL: autopick succeeded before the deadline passed'; end if;
  call pg_temp.deauth();

  -- move pick_deadline into the past, directly, as postgres/superuser (bypasses RLS)
  update public.matches set pick_deadline = now() - interval '1 minute' where id = v_match_id;

  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_autopick(v_match_id, v_match.version, 'guest', 1, 'card_g1_auto');
  call pg_temp.deauth();

  if jsonb_array_length(v_match.guest_picks) <> 2 or not (v_match.guest_autopicks @> '[1]') then
    raise exception 'FAIL: autopick did not append the pick and the autopick index, got %', row_to_json(v_match);
  end if;

  raise notice 'PASS: autopick rejects too_early, then succeeds once the deadline has passed';
end;
$$;

-- ── drive both sides to 24 picks each -> building ───────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
  v_h_len int;
  v_g_len int;
begin
  select * into v_match from public.matches where id = v_match_id;
  v_h_len := jsonb_array_length(v_match.host_picks);
  v_g_len := jsonb_array_length(v_match.guest_picks);

  while v_h_len < 24 or v_g_len < 24 loop
    if v_h_len <= v_g_len and v_h_len < 24 then
      call pg_temp.impersonate(v_host);
      select * into v_match from public.matches where id = v_match_id;
      v_match := public.match_pick(v_match_id, v_match.version, v_h_len, 'card_h' || v_h_len);
      call pg_temp.deauth();
      v_h_len := v_h_len + 1;
    elsif v_g_len < 24 then
      call pg_temp.impersonate(v_guest);
      select * into v_match from public.matches where id = v_match_id;
      v_match := public.match_pick(v_match_id, v_match.version, v_g_len, 'card_g' || v_g_len);
      call pg_temp.deauth();
      v_g_len := v_g_len + 1;
    end if;
  end loop;

  if v_match.status <> 'building' or v_match.pick_deadline is not null then
    raise exception 'FAIL: expected building with no pick_deadline, got status=% deadline=%', v_match.status, v_match.pick_deadline;
  end if;
  if jsonb_array_length(v_match.host_picks) <> 24 or jsonb_array_length(v_match.guest_picks) <> 24 then
    raise exception 'FAIL: expected 24 picks each, got host=% guest=%', jsonb_array_length(v_match.host_picks), jsonb_array_length(v_match.guest_picks);
  end if;

  raise notice 'PASS: both sides reaching 24 picks moves the match to building';
end;
$$;

-- ── lock both rosters -> series ─────────────────────────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
  v_roster jsonb := '{"id":"r1","name":"Test Roster","timestamp":"2026-09-22T00:00:00.000Z","draftedCards":[],"depthChartOrder":{},"activePlays":[],"sessionId":null}'::jsonb;
begin
  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_lock_roster(v_match_id, v_match.version, v_roster);
  call pg_temp.deauth();

  if v_match.status <> 'building' or v_match.host_locked_at is null then
    raise exception 'FAIL: expected still building after only host locked, got status=% host_locked_at=%', v_match.status, v_match.host_locked_at;
  end if;

  call pg_temp.impersonate(v_guest);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_lock_roster(v_match_id, v_match.version, v_roster);
  call pg_temp.deauth();

  if v_match.status <> 'series' or v_match.guest_locked_at is null then
    raise exception 'FAIL: expected series after both locked, got status=% guest_locked_at=%', v_match.status, v_match.guest_locked_at;
  end if;

  raise notice 'PASS: locking both rosters moves the match to series';
end;
$$;

-- ── heartbeat does not bump version ─────────────────────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_version_before int;
  v_version_after int;
  v_seen_at timestamptz;
begin
  select version into v_version_before from public.matches where id = v_match_id;

  call pg_temp.impersonate(v_host);
  perform public.match_heartbeat(v_match_id);
  call pg_temp.deauth();

  select version, host_seen_at into v_version_after, v_seen_at from public.matches where id = v_match_id;

  if v_version_after <> v_version_before then
    raise exception 'FAIL: match_heartbeat bumped version from % to %', v_version_before, v_version_after;
  end if;
  if v_seen_at is null then
    raise exception 'FAIL: match_heartbeat did not set host_seen_at';
  end if;

  raise notice 'PASS: match_heartbeat updates host_seen_at without bumping version';
end;
$$;

-- ── match_seen bumps version and records {game, at} ─────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_match_id text := (select id from test_matches where key = 'm1');
  v_match public.matches;
begin
  call pg_temp.impersonate(v_host);
  select * into v_match from public.matches where id = v_match_id;
  v_match := public.match_seen(v_match_id, v_match.version, 1);
  call pg_temp.deauth();

  if (v_match.host_seen ->> 'game')::int <> 1 or v_match.host_seen ->> 'at' is null then
    raise exception 'FAIL: match_seen did not record {game, at}, got %', v_match.host_seen;
  end if;

  raise notice 'PASS: match_seen records host_seen';
end;
$$;

-- ── expiry: an old invite expires ───────────────────────────────────────────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_bystander uuid := (select id from test_ids where key = 'bystander');
  v_match public.matches;
  v_changed int;
  v_status text;
begin
  call pg_temp.impersonate(v_host);
  v_match := public.match_invite(v_bystander);
  call pg_temp.deauth();

  -- backdate the invite past the 7-day window, directly (RLS has no update policy for
  -- clients, so this has to run as the table owner/superuser).
  update public.matches set created_at = now() - interval '8 days' where id = v_match.id;

  call pg_temp.impersonate(v_host);
  v_changed := public.match_expire(v_match.id);
  call pg_temp.deauth();

  select status into v_status from public.matches where id = v_match.id;
  if v_changed <> 1 or v_status <> 'expired' then
    raise exception 'FAIL: expected the stale invite to expire, changed=% status=%', v_changed, v_status;
  end if;

  raise notice 'PASS: match_expire expires a 7-day-old invite';
end;
$$;

-- ── expiry: an idle drafting match forfeits to the side that kept picking ──

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match public.matches;
  v_changed int;
  v_status text;
  v_winner uuid;
begin
  call pg_temp.impersonate(v_guest);
  v_match := public.match_invite(v_host);
  call pg_temp.deauth();

  call pg_temp.impersonate(v_host);
  v_match := public.match_respond(v_match.id, v_match.version, true);
  -- host picks once, guest never does: guest is behind on picks -> guest is awaited.
  v_match := public.match_pick(v_match.id, v_match.version, 0, 'card_h0');
  call pg_temp.deauth();

  -- The matches_updated_at trigger would otherwise stamp this UPDATE right back to now().
  alter table public.matches disable trigger matches_updated_at;
  update public.matches set updated_at = now() - interval '8 days' where id = v_match.id;
  alter table public.matches enable trigger matches_updated_at;

  call pg_temp.impersonate(v_host);
  v_changed := public.match_expire(v_match.id);
  call pg_temp.deauth();

  select status, winner_id into v_status, v_winner from public.matches where id = v_match.id;
  if v_changed <> 1 or v_status <> 'forfeit' or v_winner <> v_host then
    raise exception 'FAIL: expected forfeit with winner=host, got changed=% status=% winner=%', v_changed, v_status, v_winner;
  end if;

  raise notice 'PASS: match_expire forfeits the side behind on picks, winner is the other side';
end;
$$;

-- ── user_directory: approved users see each other, not the pending one ─────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_pending uuid := (select id from test_ids where key = 'pending');
  v_seen_count int;
  v_has_pending boolean;
begin
  call pg_temp.impersonate(v_host);
  select count(*) into v_seen_count from public.user_directory;
  select exists(select 1 from public.user_directory where id = v_pending) into v_has_pending;
  call pg_temp.deauth();

  if v_seen_count < 3 then
    raise exception 'FAIL: expected at least 3 approved users in user_directory, got %', v_seen_count;
  end if;
  if v_has_pending then
    raise exception 'FAIL: user_directory leaked the PENDING user';
  end if;

  raise notice 'PASS: user_directory lists approved users and hides the pending one';
end;
$$;

-- ── user_directory: an unapproved caller sees nothing ───────────────────────

do $$
declare
  v_pending uuid := (select id from test_ids where key = 'pending');
  v_seen_count int;
begin
  call pg_temp.impersonate(v_pending);
  select count(*) into v_seen_count from public.user_directory;
  call pg_temp.deauth();

  if v_seen_count <> 0 then
    raise exception 'FAIL: expected an unapproved caller to see 0 directory rows, got %', v_seen_count;
  end if;

  raise notice 'PASS: an unapproved caller cannot read user_directory';
end;
$$;

-- ── match_void (202609220002): participant only, drafting/building only ─────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_bystander uuid := (select id from test_ids where key = 'bystander');
  v_match public.matches;
  v_failed boolean := false;
begin
  call pg_temp.impersonate(v_host);
  v_match := public.match_invite(v_bystander);
  call pg_temp.deauth();
  call pg_temp.impersonate(v_bystander);
  v_match := public.match_respond(v_match.id, v_match.version, true);
  call pg_temp.deauth();

  call pg_temp.impersonate(v_guest);
  begin
    perform public.match_void(v_match.id, v_match.version, 'not mine');
  exception when others then
    if sqlerrm like 'not_participant:%' then v_failed := true;
    else raise exception 'FAIL: expected not_participant voiding someone else''s match, got %', sqlerrm; end if;
  end;
  call pg_temp.deauth();
  if not v_failed then raise exception 'FAIL: a non-participant voided a match'; end if;

  call pg_temp.impersonate(v_host);
  v_match := public.match_void(v_match.id, v_match.version, 'replay: seat human-4 pick 3 not in its pack');
  if v_match.status <> 'void' or v_match.void_reason not like 'replay:%' then
    raise exception 'FAIL: expected void with a reason, got status=% reason=%', v_match.status, v_match.void_reason;
  end if;
  v_failed := false;
  begin
    perform public.match_void(v_match.id, v_match.version, 'again');
  exception when others then
    if sqlerrm like 'bad_status:%' then v_failed := true;
    else raise exception 'FAIL: expected bad_status voiding twice, got %', sqlerrm; end if;
  end;
  call pg_temp.deauth();
  if not v_failed then raise exception 'FAIL: a void match was voided again'; end if;

  raise notice 'PASS: match_void is participant-only, records the reason, and is final';
end;
$$;

rollback;
