import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string; next?: string | null };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const next = typeof body.next === 'string' && body.next.startsWith('/') ? body.next : '/';

  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unable to create a session.' }, { status: 500 });

  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).maybeSingle();
  if (profile?.status === 'REJECTED') {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'This account has been rejected.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, redirect: profile?.status === 'APPROVED' ? next : '/pending' });
}