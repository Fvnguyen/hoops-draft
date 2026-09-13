import 'server-only';

import { createSupabaseServerClient } from './supabase/server';

export type AccountProfile = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'USER' | 'ADMIN';
};

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<AccountProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, username, display_name, status, role')
    .eq('id', user.id)
    .maybeSingle();

  return data as AccountProfile | null;
}