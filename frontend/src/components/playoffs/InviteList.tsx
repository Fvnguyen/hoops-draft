'use client';

/**
 * pvp_match T4: the `/playoffs/new` invite list — every approved user (owner: a friends
 * list narrows this later; D3), an Invite button per row calling `match_invite`, and the
 * pending invites already sent (host_id = me, status 'invited') so a second click on the
 * same person surfaces `duplicate_invite` as a friendly state instead of a raw error.
 */
import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useCurrentProfile } from '@/components/AuthProvider';
import { useMatchList } from '@/hooks/useMatch';
import { loadMatchClient } from '@/lib/matchChannel';
import { matchErrorCode, type DirectoryUser, type MatchSummary } from '@/storage/matchTypes';
import { Button, Panel } from '@/components/ui';
import { cn } from '@/lib/cn';

type InviteState = 'idle' | 'sending' | 'sent' | 'duplicate' | 'error';

export function InviteList() {
  const profile = useCurrentProfile();
  const { matches, loading: matchesLoading, refetch: refetchMatches } = useMatchList();

  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<Record<string, InviteState>>({});

  const loadUsers = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to invite an opponent.' : 'Could not load users.');
      const body = await response.json() as { users: DirectoryUser[] };
      setUsers(body.users);
    } catch (err) {
      setUsers([]);
      setLoadError(err instanceof Error ? err.message : 'Could not load users.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, same pattern as useNotices' load()
    void loadUsers();
  }, [loadUsers]);

  const pendingInvitesSent = new Map<string, MatchSummary>(
    matches.filter((m) => m.host_id === profile?.id && m.status === 'invited').map((m) => [m.guest_id, m]),
  );

  async function invite(guestId: string) {
    setInviteState((s) => ({ ...s, [guestId]: 'sending' }));
    try {
      const client = await loadMatchClient();
      const { error } = await client.rpc('match_invite', { p_guest_id: guestId });
      if (error) {
        const code = matchErrorCode(error.message);
        setInviteState((s) => ({ ...s, [guestId]: code === 'duplicate_invite' ? 'duplicate' : 'error' }));
        return;
      }
      setInviteState((s) => ({ ...s, [guestId]: 'sent' }));
      void refetchMatches();
    } catch {
      setInviteState((s) => ({ ...s, [guestId]: 'error' }));
    }
  }

  if (loadError) {
    return <p role="alert" className="text-sm text-danger">{loadError}</p>;
  }

  if (users === null || matchesLoading) {
    return <p className="text-sm text-ink-muted">Loading players…</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-ink-muted">Nobody else has an account yet — invite a friend to sign up first.</p>;
  }

  return (
    <div className="space-y-2">
      {users.map((user) => {
        const pending = pendingInvitesSent.get(user.id);
        const state = inviteState[user.id] ?? (pending ? 'sent' : 'idle');
        return (
          <Panel key={user.id} variant="sunken" padding="sm" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{user.display_name}</p>
              {user.username && <p className="truncate text-xs text-ink-subtle">@{user.username}</p>}
            </div>
            <InviteButton state={state} onInvite={() => void invite(user.id)} />
          </Panel>
        );
      })}
    </div>
  );
}

function InviteButton({ state, onInvite }: { state: InviteState; onInvite: () => void }) {
  if (state === 'sent') {
    return <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-muted">Invite sent</span>;
  }
  if (state === 'duplicate') {
    return <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-warn">Already invited</span>;
  }
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={onInvite}
      disabled={state === 'sending'}
      icon={<UserPlus className="h-4 w-4" />}
      className={cn('shrink-0', state === 'error' && 'border-danger text-danger')}
    >
      {state === 'sending' ? 'Inviting…' : state === 'error' ? 'Retry invite' : 'Invite'}
    </Button>
  );
}
