import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GENERIC_ERROR = 'Username/email or password is incorrect.';

export async function POST(request: Request) {
  const body = await request.json() as { identifier?: string; password?: string; next?: string | null };
  const identifier = body.identifier?.trim();
  const password = body.password ?? '';
  const next = typeof body.next === 'string' && body.next.startsWith('/') ? body.next : '/';

  if (!identifier || !password) return NextResponse.json({ error: 'Enter your username or email and password.' }, { status: 400 });

  // A username can never contain '@' (profiles_username_format), so this split is
  // unambiguous: treat anything with an '@' as an email, everything else as a
  // username that needs resolving to an email before Supabase can authenticate it.
  let email = identifier.toLowerCase();
  if (!email.includes('@')) {
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from('profiles').select('email').eq('username', email).maybeSingle();
    if (!profile) return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    email = profile.email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unable to create a session.' }, { status: 500 });

  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).maybeSingle();
  if (profile?.status === 'REJECTED') {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'This account has been rejected.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, redirect: profile?.status === 'APPROVED' ? next : '/pending' });
}
