import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string; displayName?: string; username?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const displayName = body.displayName?.trim();
  const username = body.username?.trim().toLowerCase();

  if (!email || !email.includes('@') || password.length < 10 || !displayName) {
    return NextResponse.json({ error: 'Enter a display name, valid email, and password of at least 10 characters.' }, { status: 400 });
  }
  if (!username || !USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: 'Username must be 3-20 letters, numbers, or underscores.' }, { status: 400 });
  }

  // Best-effort pre-check so a taken username gets a clear error instead of a raw
  // Postgres unique-constraint failure; the DB constraint (profiles_username_unique)
  // is still the source of truth for a concurrent signup racing this check.
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existing) return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, username } },
  });

  if (error) {
    // The trigger's unique-constraint failure surfaces here as a raw Postgres
    // message if the pre-check above lost a race; give the same friendly error.
    const message = error.message.toLowerCase().includes('username')
      ? 'That username is taken.'
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Supabase returns ok:true with a stub user (identities: []) instead of an
  // error when the email already exists, to avoid leaking account existence.
  // Without this check that silently no-ops: no auth.users row is inserted,
  // the handle_new_user trigger never fires, and no profiles row is created —
  // so the account is neither approved nor visible on the admin page.
  if (data.user && data.user.identities?.length === 0) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
