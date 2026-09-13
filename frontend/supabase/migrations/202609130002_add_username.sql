-- Adds a login-by-username handle separate from the display name shown in the UI.
-- Existing rows are backfilled from their email's local part; the admin bootstrap
-- script and the signup trigger both set it explicitly for new/updated accounts.

alter table public.profiles add column if not exists username text;

update public.profiles
set username = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9_]', '', 'g'))
where username is null;

alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$');
alter table public.profiles add constraint profiles_username_unique unique (username);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  candidate_username text;
begin
  candidate_username := coalesce(
    nullif(lower(regexp_replace(new.raw_user_meta_data ->> 'username', '[^a-z0-9_]', '', 'g')), ''),
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'))
  );

  insert into public.profiles (id, email, username, display_name, status)
  values (
    new.id,
    lower(new.email),
    candidate_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when lower(new.email) = 'nguyen.teomads@gmail.com' then 'APPROVED'::public.account_status else 'PENDING'::public.account_status end
  );
  return new;
end;
$$;
