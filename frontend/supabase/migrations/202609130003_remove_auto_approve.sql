-- The hardcoded auto-approve for nguyen.teomads@gmail.com masked a real signup bug
-- (the trigger's dependency on that literal made debugging harder) and was never a
-- real "pre-approved list" feature. Removing it: every signup now lands PENDING and
-- goes through /admin/users like any other account.

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
    'PENDING'::public.account_status
  );
  return new;
end;
$$;
