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

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: 'E2E Test', username: 'e2e_test' },
});

// Supabase's actual wording is "already been registered" (code 'email_exists'), not
// "already registered" — match on the error code first, the substrings as a fallback
// in case the wording changes again.
const alreadyExists = error?.code === 'email_exists'
  || error?.message.toLowerCase().includes('already registered')
  || error?.message.toLowerCase().includes('already been registered');
if (error && !alreadyExists) throw error;
let user = data.user;
if (!user) {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  user = users.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
}
if (!user) throw new Error(`Could not find ${email} after creating or looking up the account.`);

// If the account already existed from a prior run, resetting the password here keeps
// E2E_TEST_PASSWORD authoritative — no separate "did the password change" flow to manage.
if (alreadyExists) {
  const { error: pwError } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (pwError) throw pwError;
}

const { error: profileError } = await supabase.from('profiles').update({ display_name: 'E2E Test', username: 'e2e_test', status: 'APPROVED', role: 'USER' }).eq('id', user.id);
if (profileError) throw profileError;

console.log(`E2E test account ready for ${email}.`);
