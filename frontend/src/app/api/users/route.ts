import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DirectoryUser } from '@/storage/matchTypes';

export const runtime = 'nodejs';

/**
 * pvp_match T4/D3: `public.user_directory` (approved profiles, `id, display_name,
 * username`) minus the caller — the invite list on `/playoffs/new`. Runs under the
 * caller's own session (RLS already limits the view to approved users), so a 401 for
 * anyone not signed in is enough; no ADMIN/APPROVED gate here beyond what the view itself
 * enforces server-side.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_directory')
    .select('id, display_name, username')
    .neq('id', user.id)
    .order('display_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: (data ?? []) as DirectoryUser[] });
}
