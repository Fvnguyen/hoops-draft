'use client';

import { useEffect } from 'react';
import { ErrorRecovery } from '@/components/ErrorRecovery';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorRecovery error={error} reset={reset} />;
}
