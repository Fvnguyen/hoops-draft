'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      size="lg"
      className="w-full"
      onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }}
    >
      SIGN OUT
    </Button>
  );
}
