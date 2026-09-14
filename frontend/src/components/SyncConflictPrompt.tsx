'use client';

/**
 * accounts_cloud_saves D7: the one conflict a human ever has to resolve — a roster
 * edited on two devices since they last agreed. Draft/season conflicts never reach this
 * (storage/merge.ts auto-merges them); only `mergeRoster` always returns `conflict: true`.
 * Reuses Toast's visual language (dark pill, amber accent) rather than a new component
 * style.
 */
import { getGameStore, type SyncConflict } from '@/storage';

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
        <div key={`${conflict.table}:${conflict.id}`} className="rounded-lg bg-stone-800 p-4 text-sm text-white shadow-lg">
          <p className="mb-2 font-semibold">&ldquo;{labelFor(conflict)}&rdquo; changed on another device</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => resolve(conflict, 'local')}
              className="flex-1 rounded bg-stone-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide hover:bg-stone-600"
            >
              Keep this device
            </button>
            <button
              type="button"
              onClick={() => resolve(conflict, 'remote')}
              className="flex-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide hover:bg-amber-500"
            >
              Use cloud version
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
