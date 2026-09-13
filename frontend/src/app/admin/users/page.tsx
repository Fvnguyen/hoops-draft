import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { UserApprovalList } from './UserApprovalList';

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'APPROVED') redirect('/login');
  if (profile.role !== 'ADMIN') redirect('/');

  const admin = createSupabaseAdminClient();
  const { data: users } = await admin.from('profiles').select('id, email, display_name, status, role, created_at').order('created_at', { ascending: false });

  return <main className="min-h-screen bg-stone-950 px-6 py-12 text-white"><div className="mx-auto max-w-4xl"><p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-yellow-400">Commissioner tools</p><h1 className="mb-2 font-display text-6xl italic">ACCOUNT APPROVAL</h1><p className="mb-8 text-stone-400">Review who gets a seat at the table.</p><UserApprovalList initialUsers={users ?? []} /></div></main>;
}