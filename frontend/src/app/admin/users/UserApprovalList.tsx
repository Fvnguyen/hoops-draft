'use client';

import { useState } from 'react';

type User = { id: string; email: string; username: string; display_name: string; status: string; role: string; created_at: string };

export function UserApprovalList({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState('');

  async function updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    setError('');
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      setError('The account could not be updated.');
      return;
    }
    setUsers((current) => current.map((user) => user.id === id ? { ...user, status } : user));
  }

  return <div className="space-y-3">
    {error && <p role="alert" className="border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}
    {users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-700 bg-stone-900/70 p-4">
      <div><p className="font-bold text-white">{user.display_name} <span className="font-normal text-stone-500">@{user.username}</span></p><p className="text-sm text-stone-400">{user.email}</p></div>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><span className={user.status === 'APPROVED' ? 'text-emerald-300' : user.status === 'REJECTED' ? 'text-red-300' : 'text-yellow-300'}>{user.status}</span>{user.status === 'PENDING' && <><button onClick={() => updateStatus(user.id, 'APPROVED')} className="border border-emerald-400/50 px-3 py-2 text-emerald-200 hover:bg-emerald-900/50">Approve</button><button onClick={() => updateStatus(user.id, 'REJECTED')} className="border border-red-400/50 px-3 py-2 text-red-200 hover:bg-red-900/50">Reject</button></>}</div>
    </div>)}
    {users.length === 0 && <p className="text-stone-400">No accounts yet.</p>}
  </div>;
}