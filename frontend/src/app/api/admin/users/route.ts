import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'APPROVED' || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, display_name, status, role, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'APPROVED' || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as { id?: string; status?: 'APPROVED' | 'REJECTED' };
  if (!body.id || !body.status) return NextResponse.json({ error: 'Invalid approval request.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('profiles').update({ status: body.status }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}