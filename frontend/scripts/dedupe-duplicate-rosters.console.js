/**
 * One-off cleanup for the duplicate-roster bug fixed by
 * "fix: dedupe 82:0 rosters saved from the same DeckBuilder session".
 *
 * Before that fix, `handleSaveRoster` (frontend/src/components/DeckBuilder.tsx)
 * minted a fresh `roster_<timestamp>` id on every save instead of reusing one
 * for the DeckBuilder session, so a double-click (or any repeated save) wrote
 * two+ roster rows with identical drafted cards under the same draft session.
 * Only one of them ever got a ChallengeRun, which is why `/rosters` showed the
 * roster twice with just one marked "completed".
 *
 * This is NOT a Node/tsx script: roster data lives in the browser's IndexedDB
 * (Dexie, database "MagicBallDB" — see frontend/src/storage/indexedDb.ts),
 * which a Node process can't reach. Run this in the browser's DevTools
 * console instead, on any page of the app (the `/rosters` page is a good
 * place to be, so you can immediately see the result):
 *
 *   1. Open DevTools > Console.
 *   2. Paste this whole file and press Enter. It runs in DRY-RUN mode by
 *      default: it only logs what it *would* delete, and deletes nothing.
 *   3. Review the "Would delete" groups in the console output.
 *   4. Re-run with `dedupeDuplicateRosters({ dryRun: false })` to actually
 *      delete the confirmed duplicates.
 *
 * Survivor rule per duplicate group (same sessionId + same drafted card ids,
 * regardless of order):
 *   - keep the roster that has a matching ChallengeRun (challengeRuns.rosterId),
 *   - otherwise keep the newest by `timestamp`.
 * Everything else in the group is deleted from the `rosters` object store.
 * Sessions, seasons and any ChallengeRun rows are never touched.
 */
async function dedupeDuplicateRosters({ dryRun = true } = {}) {
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('MagicBallDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      // No onupgradeneeded handler: we must not create/alter the schema here.
      // If this ever fires it means the DB doesn't exist yet (nothing to do).
    });
  }

  function getAll(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function deleteIds(db, storeName, ids) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function fingerprint(roster) {
    const cardIds = (roster.draftedCards ?? []).map((c) => c.id).sort();
    return `${roster.sessionId ?? 'no-session'}::${cardIds.join(',')}`;
  }

  const db = await openDb();
  const rosters = await getAll(db, 'rosters');
  const challengeRuns = await getAll(db, 'challengeRuns');
  const rosterIdsWithRun = new Set(challengeRuns.map((r) => r.rosterId));

  const groups = new Map();
  for (const roster of rosters) {
    const key = fingerprint(roster);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(roster);
  }

  const toDelete = [];
  let dupGroupCount = 0;

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    dupGroupCount++;

    const withRun = group.filter((r) => rosterIdsWithRun.has(r.id));
    let survivor;
    if (withRun.length >= 1) {
      // Prefer the newest among those with a run, in the (rare) case more than one does.
      survivor = withRun.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    } else {
      survivor = group.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    }

    const losers = group.filter((r) => r.id !== survivor.id);
    toDelete.push(...losers.map((r) => r.id));

    console.log(
      `[dedupe] group "${key}": ${group.length} rosters -> keeping "${survivor.name}" (${survivor.id}, ` +
        `${rosterIdsWithRun.has(survivor.id) ? 'has run' : 'no run, newest'}), ` +
        `${dryRun ? 'would delete' : 'deleting'} ${losers.length}: ${losers.map((r) => r.id).join(', ')}`
    );
  }

  if (dupGroupCount === 0) {
    console.log('[dedupe] No duplicate roster groups found. Nothing to do.');
    return { dupGroupCount: 0, deleted: [] };
  }

  if (dryRun) {
    console.log(
      `[dedupe] DRY RUN: found ${dupGroupCount} duplicate group(s), ${toDelete.length} roster(s) would be deleted. ` +
        'Re-run with dedupeDuplicateRosters({ dryRun: false }) to actually delete them.'
    );
    return { dupGroupCount, wouldDelete: toDelete };
  }

  await deleteIds(db, 'rosters', toDelete);
  console.log(`[dedupe] Deleted ${toDelete.length} duplicate roster(s) across ${dupGroupCount} group(s).`);
  return { dupGroupCount, deleted: toDelete };
}

// Dry run by default so pasting this file never deletes anything by accident.
dedupeDuplicateRosters();
