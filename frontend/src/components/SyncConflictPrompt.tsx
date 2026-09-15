'use client';

/**
 * accounts_cloud_saves D7: the one conflict a human ever has to resolve — a roster
 * edited on two devices since they last agreed. Draft/season conflicts never reach this
 * (storage/merge.ts auto-merges them); only `mergeRoster` always returns `conflict: true`.
 *
 * plan_ui_foundation D9: a fixed bottom-right corner stack, NOT a modal (no Overlay —
 * it must stay visible and non-blocking while the rest of the app is used), built from
 * `Panel variant="inverse"` + `Button` so it matches the shared control language instead
 * of one-off dark-pill markup.
 */
import { getGameStore, type SyncConflict } from '@/storage';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';

function labelFor(conflict: SyncConflict): string {
  const record = conflict.local as { name?: string } | undefined;
  return record?.name ?? conflict.id;
}

export function SyncConflictPrompt({ conflicts }: { conflicts: SyncConflict[] }) {
  if (!conflicts.length) return null;
  const store = getGameStore();

  async function resolve(conflict: SyncConflict, choice: 'local' | 'remote') {
    await store.resolveConflict(conflict.table, conflict.id, choice);
  }

  return (
    <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2 max-w-xs">
      {conflicts.map((conflict) => (
        <Panel key={`${conflict.table}:${conflict.id}`} variant="inverse" padding="md" className="text-sm shadow-lg">
          <p className="mb-2 font-semibold">&ldquo;{labelFor(conflict)}&rdquo; changed on another device</p>
          <div className="flex gap-2">
            <Button
              variant="inverse"
              className="flex-1"
              onClick={() => resolve(conflict, 'local')}
            >
              Keep this device
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => resolve(conflict, 'remote')}
            >
              Use cloud version
            </Button>
          </div>
        </Panel>
      ))}
    </div>
  );
}
