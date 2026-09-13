'use client';

import { useEffect } from 'react';
import { ErrorRecovery } from '@/components/ErrorRecovery';

// Only triggers for errors thrown by the root layout itself (rare — most
// errors are caught by app/error.tsx instead), which is why this file has
// to render its own <html>/<body>: the layout that would normally provide
// them is the thing that threw.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorRecovery error={error} reset={reset} />
      </body>
    </html>
  );
}
