-- accounts_cloud_saves plan (D1/D2/D4): cloud-synced draft sessions, rosters, seasons.

create table public.draft_sessions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  client_timestamp timestamptz not null,
  updated_at timestamptz not null default now()
);
create index draft_sessions_owner_id_idx on public.draft_sessions (owner_id);

create table public.rosters (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  client_timestamp timestamptz not null,
  updated_at timestamptz not null default now()
);
create index rosters_owner_id_idx on public.rosters (owner_id);

create table public.seasons (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  client_timestamp timestamptz not null,
  updated_at timestamptz not null default now()
);
create index seasons_owner_id_idx on public.seasons (owner_id);

alter table public.draft_sessions enable row level security;
alter table public.rosters enable row level security;
alter table public.seasons enable row level security;

-- D2: owner has full CRUD on their own rows.
create policy "owner full access" on public.draft_sessions for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner full access" on public.rosters for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner full access" on public.seasons for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- D2/D6: an ADMIN profile can additionally read every owner's rows, for analytics.
-- Postgres OR's multiple permissive policies together, so this adds to (never replaces)
-- the owner policy above.
create policy "admin read all" on public.draft_sessions for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'ADMIN'));
create policy "admin read all" on public.rosters for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'ADMIN'));
create policy "admin read all" on public.seasons for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'ADMIN'));

revoke all on public.draft_sessions, public.rosters, public.seasons from anon, authenticated;
grant select, insert, update, delete on public.draft_sessions, public.rosters, public.seasons to authenticated;

-- D4: compare-and-swap upsert. Every client push goes through this RPC instead of a raw
-- upsert, so "did this row change under me" is one round trip. `security invoker` means
-- the dynamic UPDATE/INSERT below still runs under the calling user's RLS (the owner_id
-- checks above), not as the function owner — the `table_name` allowlist below exists only
-- to keep the dynamic identifier safe, not to bypass RLS.
--
-- expected_updated_at = null means "I believe this row doesn't exist yet" (first push of
-- a brand-new record, or the one-time local->cloud migration): insert-only, and a
-- unique_violation (row already exists) returns ok=false with the current row rather than
-- raising, so callers can tell "already synced, nothing to do" apart from "genuine
-- update conflict, run a merge" (D4/D5).
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
  if table_name not in ('draft_sessions', 'rosters', 'seasons') then
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
