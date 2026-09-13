# Supabase auth setup

1. Open the Supabase SQL editor for the project and run
   `migrations/202609130001_auth_approval.sql`.
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

The database trigger automatically approves `nguyen.teomads@gmail.com`. All other
registrations remain pending until an approved administrator changes their status at
`/admin/users`.