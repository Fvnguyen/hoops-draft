'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useRefreshAuth } from '@/components/AuthProvider';

export function LogoutButton() {
  const router = useRouter();
  const refreshAuth = useRefreshAuth();
  return (
    <Button
      size="lg"
      className="w-full"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        // sync_outbox D1: soft navigation (push + refresh, no remount) — without this the
        // profile context keeps showing the old user until a hard reload.
        await refreshAuth({ identityChanged: true });
        router.push('/login');
        router.refresh();
      }}
    >
      SIGN OUT
    </Button>
  );
}
