-- Test script for 202611030001_match_card_set.sql (season_2026_27 T6).
--
-- Run AFTER the migration (and after 202609220001/202609220002). One transaction, rolled
-- back at the end: safe to run against a real (including production, per the owner's
-- dry-run process) database. It creates its own throwaway auth users/profiles and only
-- ever touches matches it created itself. Same impersonation helpers as
-- 202609220001_matches_test.sql (`auth.uid()` reads the request.jwt.claims GUC).

begin;

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

-- ── fixtures: three approved throwaway users ────────────────────────────────

do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_guest2 uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_host, 'authenticated', 'authenticated',
     'cardset-test-host@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Cardset Host', 'username', 'cardsettesthost')::jsonb, now(), now(),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_guest, 'authenticated', 'authenticated',
     'cardset-test-guest@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Cardset Guest', 'username', 'cardsettestguest')::jsonb, now(), now(),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_guest2, 'authenticated', 'authenticated',
     'cardset-test-guest2@example.com', 'x', now(), '{"provider":"email","providers":["email"]}',
     json_build_object('display_name', 'Cardset Guest Two', 'username', 'cardsettestguest2')::jsonb, now(), now(),
     '', '', '', '');

  update public.profiles set status = 'APPROVED' where id in (v_host, v_guest, v_guest2);

  create temp table test_ids (key text primary key, id uuid not null);
  grant all on test_ids to authenticated;
  insert into test_ids (key, id) values ('host', v_host), ('guest', v_guest), ('guest2', v_guest2);

  raise notice 'PASS: fixtures created (host=%, guest=%, guest2=%)', v_host, v_guest, v_guest2;
end;
$$;

-- ── schema: the column, one match_invite overload, same security settings ───────

do $$
declare
  v_type text;
  v_nullable text;
  v_count int;
  v_secdef boolean;
  v_config text[];
begin
  select data_type, is_nullable into v_type, v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'matches' and column_name = 'card_set_version';
  if v_type is distinct from 'text' or v_nullable is distinct from 'YES' then
    raise exception 'FAIL: matches.card_set_version should be nullable text, got type=% nullable=%', v_type, v_nullable;
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'match_invite';
  if v_count <> 1 then
    raise exception 'FAIL: expected exactly one match_invite overload, found %', v_count;
  end if;

  select p.prosecdef, p.proconfig into v_secdef, v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'match_invite';
  if not v_secdef then
    raise exception 'FAIL: match_invite must stay security definer';
  end if;
  if v_config is null or not ('search_path=public' = any (v_config)) then
    raise exception 'FAIL: match_invite must keep search_path = public, got %', v_config;
  end if;

  if not has_function_privilege('authenticated', 'public.match_invite(uuid, text)', 'execute') then
    raise exception 'FAIL: authenticated lost execute on match_invite';
  end if;
  if has_function_privilege('anon', 'public.match_invite(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can execute match_invite';
  end if;

  raise notice 'PASS: card_set_version is nullable text; one match_invite(uuid, text), security definer, search_path=public, authenticated only';
end;
$$;

-- ── the deployed client's one-argument call still works and records NULL (legacy) ──

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_match public.matches;
begin
  call pg_temp.impersonate(v_host);
  v_match := public.match_invite(v_guest);
  call pg_temp.deauth();
  if v_match.status <> 'invited' or v_match.card_set_version is not null then
    raise exception 'FAIL: one-argument invite should be invited with NULL card set, got status=% card_set_version=%',
      v_match.status, v_match.card_set_version;
  end if;
  raise notice 'PASS: one-argument match_invite records card_set_version NULL';
end;
$$;

-- ── the new client's call records the version, readable by the participants ──────

do $$
declare
  v_host uuid := (select id from test_ids where key = 'host');
  v_guest2 uuid := (select id from test_ids where key = 'guest2');
  v_match public.matches;
  v_seen text;
begin
  call pg_temp.impersonate(v_host);
  v_match := public.match_invite(v_guest2, '2026-27.1');
  call pg_temp.deauth();
  if v_match.card_set_version is distinct from '2026-27.1' then
    raise exception 'FAIL: expected card_set_version 2026-27.1, got %', v_match.card_set_version;
  end if;

  -- Survives accept (match_respond rewrites the row) and is visible through RLS.
  call pg_temp.impersonate(v_guest2);
  v_match := public.match_respond(v_match.id, v_match.version, true);
  select card_set_version into v_seen from public.matches where id = v_match.id;
  call pg_temp.deauth();
  if v_match.status <> 'drafting' or v_seen is distinct from '2026-27.1' then
    raise exception 'FAIL: after accept expected drafting with 2026-27.1, got status=% seen=%', v_match.status, v_seen;
  end if;
  raise notice 'PASS: two-argument match_invite records the card set; it survives accept and is readable by the guest';
end;
$$;

-- ── a malformed version is rejected ───────────────────────────────────────────

do $$
declare
  v_guest uuid := (select id from test_ids where key = 'guest');
  v_guest2 uuid := (select id from test_ids where key = 'guest2');
  v_failed boolean := false;
begin
  call pg_temp.impersonate(v_guest);
  begin
    perform public.match_invite(v_guest2, repeat('x', 33));
  exception when others then
    if sqlerrm like 'bad_argument:%' then v_failed := true;
    else raise exception 'FAIL: expected bad_argument for a 33-char version, got %', sqlerrm; end if;
  end;
  call pg_temp.deauth();
  if not v_failed then raise exception 'FAIL: a 33-character card set version was accepted'; end if;
  raise notice 'PASS: match_invite rejects a malformed card set version';
end;
$$;

rollback;
