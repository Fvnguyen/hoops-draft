-- sync_outbox plan (D5/D6/D7/D8): delete tombstones, per-owner primary keys, a slimmer
-- cas_upsert, approved-only writes and a payload cap.
--
-- SAFE TO APPLY WHILE THE PREVIOUS CLIENT IS STILL DEPLOYED. That client calls cas_upsert
-- with the same arguments, reads `current_row.updated_at` on success, hard-deletes with
-- `delete ... where id = $1` and pulls `id, data, updated_at`; all of that keeps working.
-- The one visible difference for it: a row tombstoned by a NEW client still shows up in
-- its pull (it does not know `deleted_at`) until that device loads the new build.
--
-- One transaction: a failure leaves the schema exactly as it was.

begin;

-- ── D5: tombstones ─────────────────────────────────────────────────────────
-- A delete becomes `deleted_at = now()` so another device (or this one, after an offline
-- delete) can tell "deleted" apart from "never pushed" and stops re-inserting the row.
-- `data` is kept: the previous client would choke on an empty payload in its pull.
alter table public.draft_sessions add column if not exists deleted_at timestamptz;
alter table public.rosters        add column if not exists deleted_at timestamptz;
alter table public.seasons        add column if not exists deleted_at timestamptz;
alter table public.challenge_runs add column if not exists deleted_at timestamptz;

-- ── D6: primary key (owner_id, id) ─────────────────────────────────────────
-- `id` alone was global across owners, so importing another account's backup (ids are
-- kept) hit a unique_violation RLS then hid, and the push retried forever. The new key
-- leads with owner_id, which makes the old owner_id indexes redundant.
alter table public.draft_sessions drop constraint draft_sessions_pkey, add primary key (owner_id, id);
alter table public.rosters        drop constraint rosters_pkey,        add primary key (owner_id, id);
alter table public.seasons        drop constraint seasons_pkey,        add primary key (owner_id, id);
alter table public.challenge_runs drop constraint challenge_runs_pkey, add primary key (owner_id, id);

drop index if exists public.draft_sessions_owner_id_idx;
drop index if exists public.rosters_owner_id_idx;
drop index if exists public.seasons_owner_id_idx;
drop index if exists public.challenge_runs_owner_id_idx;

-- ── D8: only an APPROVED profile may write ─────────────────────────────────
-- "owner full access" let any session write, including a PENDING or REJECTED account.
-- Reads stay owner-scoped and status-blind (a rejected user can still export their data);
-- the "admin read all" select policies are untouched.
do $$
declare
  t text;
begin
  foreach t in array array['draft_sessions', 'rosters', 'seasons', 'challenge_runs'] loop
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('drop policy if exists "owner read" on public.%I', t);
    execute format('drop policy if exists "approved owner insert" on public.%I', t);
    execute format('drop policy if exists "approved owner update" on public.%I', t);
    execute format('drop policy if exists "approved owner delete" on public.%I', t);

    execute format(
      'create policy "owner read" on public.%I for select using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "approved owner insert" on public.%I for insert with check (' ||
      'owner_id = (select auth.uid()) and exists (select 1 from public.profiles p ' ||
      'where p.id = (select auth.uid()) and p.status = ''APPROVED''))', t);
    execute format(
      'create policy "approved owner update" on public.%I for update using (' ||
      'owner_id = (select auth.uid()) and exists (select 1 from public.profiles p ' ||
      'where p.id = (select auth.uid()) and p.status = ''APPROVED'')) ' ||
      'with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "approved owner delete" on public.%I for delete using (' ||
      'owner_id = (select auth.uid()) and exists (select 1 from public.profiles p ' ||
      'where p.id = (select auth.uid()) and p.status = ''APPROVED''))', t);
  end loop;
end;
$$;

-- ── Table allowlist, declared ONCE ─────────────────────────────────────────
-- cas_upsert used to carry its own hardcoded list, re-declared in full by every migration
-- that added a synced table. A new synced table now only needs this function replaced.
create or replace function public.sync_table_allowed(table_name text)
returns boolean
language sql
immutable
as $$
  select table_name in ('draft_sessions', 'rosters', 'seasons', 'challenge_runs');
$$;

-- ── D7: cas_upsert ─────────────────────────────────────────────────────────
-- Same arguments as before. Returns (ok, updated_at, current_row):
--   ok = true   updated_at is the new server stamp; current_row is ONLY {id, updated_at}
--               (it used to echo the whole payload back, so every push re-downloaded
--               what it had just uploaded; the slim object keeps the previous client,
--               which reads current_row.updated_at, working).
--   ok = false  current_row is the full conflicting row, including deleted_at, or null
--               when there is no such row; updated_at mirrors the row's stamp.
-- expected_updated_at = null still means "insert only", with one addition: a TOMBSTONED
-- row with that id is revived in place, so a deterministic id (`season_<rosterId>`) can
-- be reused after its record was deleted.
-- The return type changes, which `create or replace` cannot do, hence the drop.
drop function if exists public.cas_upsert(text, text, uuid, timestamptz, jsonb, timestamptz);

create function public.cas_upsert(
  table_name text,
  p_id text,
  p_owner_id uuid,
  expected_updated_at timestamptz,
  p_data jsonb,
  p_client_timestamp timestamptz
)
returns table (ok boolean, updated_at timestamptz, current_row jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_stamp timestamptz;
  result_row jsonb;
begin
  if not public.sync_table_allowed(table_name) then
    raise exception 'cas_upsert: invalid table_name %', table_name;
  end if;
  -- D8: 1 MiB. The largest real payload is a draft session at roughly 230 KB.
  if pg_column_size(p_data) > 1048576 then
    raise exception 'cas_upsert: payload too large (% bytes)', pg_column_size(p_data);
  end if;

  if expected_updated_at is null then
    execute format(
      'insert into public.%1$I as t (id, owner_id, data, client_timestamp) values ($1, $2, $3, $4) ' ||
      'on conflict (owner_id, id) do update set data = excluded.data, ' ||
      'client_timestamp = excluded.client_timestamp, updated_at = now(), deleted_at = null ' ||
      'where t.deleted_at is not null returning t.updated_at',
      table_name
    ) into new_stamp using p_id, p_owner_id, p_data, p_client_timestamp;
  else
    execute format(
      'update public.%1$I t set data = $1, client_timestamp = $2, updated_at = now() ' ||
      'where t.id = $3 and t.owner_id = $4 and t.updated_at = $5 and t.deleted_at is null ' ||
      'returning t.updated_at',
      table_name
    ) into new_stamp using p_data, p_client_timestamp, p_id, p_owner_id, expected_updated_at;
  end if;

  if new_stamp is not null then
    return query select true, new_stamp, jsonb_build_object('id', p_id, 'updated_at', new_stamp);
    return;
  end if;

  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.owner_id = $2', table_name)
    into result_row using p_id, p_owner_id;
  return query select false, (result_row ->> 'updated_at')::timestamptz, result_row;
end;
$$;

revoke all on function public.cas_upsert(text, text, uuid, timestamptz, jsonb, timestamptz) from public, anon;
grant execute on function public.cas_upsert(text, text, uuid, timestamptz, jsonb, timestamptz) to authenticated;

-- ── D5: cas_delete ─────────────────────────────────────────────────────────
-- Tombstones one row. Unconditional on purpose (a delete is the user's last word; there
-- is nothing to merge), idempotent, and bumps updated_at so a stale baseline on another
-- device fails its next compare-and-swap and receives the tombstone as current_row.
-- Returns the tombstone's stamp, or null when the row never reached the cloud.
create or replace function public.cas_delete(
  table_name text,
  p_id text,
  p_owner_id uuid
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  stamp timestamptz;
begin
  if not public.sync_table_allowed(table_name) then
    raise exception 'cas_delete: invalid table_name %', table_name;
  end if;

  execute format(
    'update public.%I t set deleted_at = coalesce(t.deleted_at, now()), updated_at = now() ' ||
    'where t.id = $1 and t.owner_id = $2 returning t.updated_at',
    table_name
  ) into stamp using p_id, p_owner_id;
  return stamp;
end;
$$;

revoke all on function public.cas_delete(text, text, uuid) from public, anon;
grant execute on function public.cas_delete(text, text, uuid) to authenticated;

revoke all on function public.sync_table_allowed(text) from public, anon;
grant execute on function public.sync_table_allowed(text) to authenticated;

commit;
