import { createClient } from '@supabase/supabase-js';

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
if (!email) throw new Error('Set E2E_TEST_EMAIL (see frontend/.env.example).');
if (!password || password.length < 10) {
  throw new Error('Set E2E_TEST_PASSWORD to a password of at least 10 characters.');
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Creates (or refreshes) one dedicated E2E-only login: never the real admin account. */
async function bootstrapAccount(accountEmail, accountPassword, displayName, username) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: accountEmail,
    password: accountPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName, username },
  });

  // Supabase's actual wording is "already been registered" (code 'email_exists'), not
  // "already registered" — match on the error code first, the substrings as a fallback
  // in case the wording changes again.
  const alreadyExists = error?.code === 'email_exists'
    || error?.message.toLowerCase().includes('already registered')
    || error?.message.toLowerCase().includes('already been registered');
  if (error && !alreadyExists) throw error;
  let user = data?.user;
  if (!user) {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;
    user = users.users.find((candidate) => candidate.email?.toLowerCase() === accountEmail.toLowerCase());
  }
  if (!user) throw new Error(`Could not find ${accountEmail} after creating or looking up the account.`);

  // If the account already existed from a prior run, resetting the password here keeps
  // the env var authoritative — no separate "did the password change" flow to manage.
  if (alreadyExists) {
    const { error: pwError } = await supabase.auth.admin.updateUserById(user.id, { password: accountPassword });
    if (pwError) throw pwError;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName, username, status: 'APPROVED', role: 'USER' })
    .eq('id', user.id);
  if (profileError) throw profileError;

  console.log(`E2E test account ready for ${accountEmail}.`);
}

await bootstrapAccount(email, password, 'E2E Test', 'e2e_test');

// pvp_match D9: every PvP spec needs two logged-in contexts, so `playoffs-invite.spec.ts`
// (and any later pvp_draft/pvp_series specs) can invite/accept between two real accounts.
// Optional — skipped with a message when unset, so single-account setups keep working.
const email2 = process.env.E2E_TEST_EMAIL_2;
const password2 = process.env.E2E_TEST_PASSWORD_2;
if (!email2 || !password2) {
  console.log('Skipping second E2E account: set E2E_TEST_EMAIL_2 and E2E_TEST_PASSWORD_2 to create it (see frontend/.env.example).');
} else {
  if (password2.length < 10) throw new Error('Set E2E_TEST_PASSWORD_2 to a password of at least 10 characters.');
  await bootstrapAccount(email2, password2, 'E2E Test 2', 'e2e_test_2');
}
