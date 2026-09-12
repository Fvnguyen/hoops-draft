# src/storage

Persistence layer for draft sessions, rosters and seasons. Replaces the old
`localStorage` blobs (`hoops-draft-sessions`, `hoops-draft-seasons`,
`myRosters`), which were capped at ~5MB per origin and failed silently on
quota errors.

UI code should never touch `localStorage`/Dexie directly — go through the
`GameStore` interface (`types.ts`):

```ts
import { getGameStore, initStorage } from '@/storage';

await initStorage();               // once, near the app root — migrates old data
const store = getGameStore();
await store.saveSeason(season);
const rosters = await store.listRosters();
```

`getGameStore()` returns a singleton: `IndexedDbGameStore` (Dexie) in the
browser, or `MemoryGameStore` during SSR/tests (no `indexedDB` global there).
`initStorage()` runs `migrateFromLocalStorage` once per process: it copies
any data still sitting in the old localStorage keys into the store, then
renames those keys to `<key>.migrated` (never deletes them) so nothing is
lost if migration has a bug. Safe to call on every mount — it no-ops after
the first successful run.

A `QuotaExceededError` from IndexedDB is translated to `StorageQuotaError`
(exported from `./types`) so callers can catch one thing regardless of
backend.
