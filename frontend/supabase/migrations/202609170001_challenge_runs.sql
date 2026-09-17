-- challenge_mode plan (D11): cloud-synced 82:0 challenge runs.
--
-- Same shape, RLS and CAS machinery as draft_sessions/rosters/seasons in
-- 202609140001_cloud_saves.sql. The `cas_upsert` allowlist at the bottom of that file is a
-- hardcoded list, so this table is invisible to the RPC until the function is replaced —
-- without the redefinition below every challenge-run push raises
-- "cas_upsert: invalid table_name challenge_runs" at runtime.

create table public.challenge_runs (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  client_timestamp timestamptz not null,
  updated_at timestamptz not null default now()
);
create index challenge_runs_owner_id_idx on public.challenge_runs (owner_id);

alter table public.challenge_runs enable row level security;

create policy "owner full access" on public.challenge_runs for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "admin read all" on public.challenge_runs for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'ADMIN'));

revoke all on public.challenge_runs from anon, authenticated;
grant select, insert, update, delete on public.challenge_runs to authenticated;

-- Re-declare cas_upsert with challenge_runs added to the allowlist. The body is otherwise
-- byte-identical to 202609140001_cloud_saves.sql — if that function changes, change it here
-- too, because whichever migration runs last wins.
create or replace function public.cas_upsert(
  table_name text,
  p_id text,
  p_owner_id uuid,
  expected_updated_at timestamptz,
  p_data jsonb,
  p_client_timestamp timestamptz
)
returns table (ok boolean, current_row jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  result_row jsonb;
  affected int;
begin
  if table_name not in ('draft_sessions', 'rosters', 'seasons', 'challenge_runs') then
    raise exception 'cas_upsert: invalid table_name %', table_name;
  end if;

  if expected_updated_at is null then
    begin
      execute format(
        'insert into public.%I (id, owner_id, data, client_timestamp) values ($1, $2, $3, $4) returning to_jsonb(%I.*)',
        table_name, table_name
      ) into result_row using p_id, p_owner_id, p_data, p_client_timestamp;
      return query select true, result_row;
      return;
    exception when unique_violation then
      execute format('select to_jsonb(t.*) from public.%I t where t.id = $1', table_name)
        into result_row using p_id;
      return query select false, result_row;
      return;
    end;
  end if;

  execute format(
    'update public.%I set data = $1, client_timestamp = $2, updated_at = now() ' ||
    'where id = $3 and owner_id = $4 and updated_at = $5 returning to_jsonb(%I.*)',
    table_name, table_name
  ) into result_row using p_data, p_client_timestamp, p_id, p_owner_id, expected_updated_at;

  get diagnostics affected = row_count;
  if affected = 1 then
    return query select true, result_row;
    return;
  end if;

  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1', table_name)
    into result_row using p_id;
  return query select false, result_row;
end;
$$;

revoke all on function public.cas_upsert from public, anon;
grant execute on function public.cas_upsert to authenticated;
