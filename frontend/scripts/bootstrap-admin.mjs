import { createClient } from '@supabase/supabase-js';

const email = 'nguyen.fabian@gmail.com';
const password = process.env.MAGIC_BALL_ADMIN_PASSWORD;
if (!password || password.length < 10) {
  throw new Error('Set MAGIC_BALL_ADMIN_PASSWORD to a new password of at least 10 characters.');
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: 'Fvnguyen', username: 'fvnguyen' },
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
  user = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
}
if (!user) throw new Error(`Could not find ${email} after creating or looking up the account.`);

const { error: profileError } = await supabase.from('profiles').update({ display_name: 'Fvnguyen', username: 'fvnguyen', status: 'APPROVED', role: 'ADMIN' }).eq('id', user.id);
if (profileError) throw profileError;

console.log(`Admin account ready for ${email}.`);