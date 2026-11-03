'use client';

/**
 * season_2026_27 D9: shown when a draft, an 82:0 run or a Playoffs match was started on a
 * card set this build no longer carries (`isCardSetAvailable` is false: older than the
 * four kept frozen sets). It cannot be replayed on today's cards without changing its
 * packs or opponents, so the only action is Abandon.
 */

import { useState } from 'react';
import { Button, Panel } from './ui';

export function OlderCardSetNotice({
  what,
  onAbandon,
}: {
  /** "draft", "82:0 run", "match": completes "This … started on an older card set". */
  what: string;
  /** Deletes / voids the object; the caller routes away when it resolves. */
  onAbandon: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh-z items-center justify-center p-4 font-sans" data-older-card-set>
      <Panel role="alertdialog" aria-labelledby="older-card-set-heading" padding="lg" className="w-full max-w-sm">
        <h2 id="older-card-set-heading" className="mb-2 text-xl font-bold uppercase text-ink-strong">
          Started on an older card set
        </h2>
        <p className="mb-6 text-sm text-ink-muted">
          This {what} was started on a card set that is no longer available, so it can&apos;t be
          continued without changing its players.
        </p>
        <div className="flex justify-end">
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAbandon();
              } finally {
                setBusy(false);
              }
            }}
          >
            Abandon
          </Button>
        </div>
      </Panel>
    </div>
  );
}
