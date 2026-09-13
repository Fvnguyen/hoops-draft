import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string; displayName?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const displayName = body.displayName?.trim();

  if (!email || !email.includes('@') || password.length < 10 || !displayName) {
    return NextResponse.json({ error: 'Enter a display name, valid email, and password of at least 10 characters.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, autoApproved: email === 'nguyen.teomads@gmail.com' });
}