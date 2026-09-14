# Supabase setup

1. Apply the migrations in order, either from the Supabase SQL editor (paste each file's
   contents and run) or directly from this repo with `scripts/run-migration.mjs` (same
   approach as TG-Training):

   ```powershell
   npm run migrate -- supabase/migrations/202609130001_auth_approval.sql supabase/migrations/202609130002_add_username.sql supabase/migrations/202609130003_remove_auto_approve.sql supabase/migrations/202609140001_cloud_saves.sql
   ```

   `202609140001_cloud_saves.sql` (accounts_cloud_saves plan) adds the `draft_sessions`/
   `rosters`/`seasons` tables `SupabaseGameStore` (`frontend/src/storage/supabase.ts`)
   syncs to, their RLS policies (owner full access; an ADMIN profile can additionally
   read every owner's rows, for `/admin/analytics`), and the `cas_upsert` RPC every push
   goes through.

   Requires `SUPABASE_DB_URL` in `frontend/.env.local` — Dashboard -> Project Settings ->
   Database -> Connection string -> URI, **Session pooler** mode (the direct `db.<ref>`
   host is IPv6-only and unreachable from IPv4-only networks). Never commit this value;
   it is used only by this script, never at runtime.
   `202609130002_add_username.sql` adds the `username` login handle, backfilling existing
   rows from their email's local part. `202609130003_remove_auto_approve.sql` removes the
   hardcoded auto-approve email (see note below) — every signup now lands PENDING.
2. Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in local
   `frontend/.env.local` and in Vercel Development, Preview, and Production.
3. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Add it to Vercel as a Secret and
   to local `frontend/.env.local`; never commit either value.
4. Create the initial administrator once from `frontend/` after the migration:

   ```powershell
   $env:MAGIC_BALL_ADMIN_PASSWORD = '<new password typed locally>'
   npm run bootstrap:admin
   Remove-Item Env:\MAGIC_BALL_ADMIN_PASSWORD
   ```

   The command creates or upgrades `nguyen.fabian@gmail.com` as the `Fvnguyen`
   administrator. Do not use the password previously shared in chat.

All registrations land `PENDING` until an approved administrator changes their status
at `/admin/users` — there is no auto-approved email (the previous hardcoded
`nguyen.teomads@gmail.com` special case was removed in `202609130003_remove_auto_approve.sql`).

5. For `npm run test:e2e` (Playwright): set `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` in
   `frontend/.env.local` (a plus-addressed alias of your own email is fine — see
   `.env.example`), then run `npm run bootstrap:e2e` once to create/approve that dedicated
   test account. `tests/auth.setup.ts` logs in as it automatically before the suite runs.