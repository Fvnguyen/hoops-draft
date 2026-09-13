create type public.account_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.account_role as enum ('USER', 'ADMIN');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  status public.account_status not null default 'PENDING',
  role public.account_role not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, status)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when lower(new.email) = 'nguyen.teomads@gmail.com' then 'APPROVED'::public.account_status else 'PENDING'::public.account_status end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "users can read their own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;