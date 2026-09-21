#!/usr/bin/env tsx
/**
 * One-off generator for `tests/fixtures/season-fixture.json`, the import bundle
 * `tests/season.spec.ts` uploads via the rosters page's "Import" button to get a real,
 * unplayed 7-game season without driving a full draft through the UI. Not run as part
 * of any npm script or CI step — re-run by hand (`npx tsx
 * scripts/build-e2e-season-fixture.ts`) only if the fixture needs regenerating (e.g. the
 * roster/session/season shape changes in a way that breaks import).
 *
 * A fixed seed keeps the draft (and so the fixture file) deterministic across runs.
 */
import fs from 'fs';
import path from 'path';

import { loadPlayers, PLAYS, runHeadlessDraft } from '../tests/unit/helpers';
import { createSeason } from '../src/engine/season';
import type { DraftSession } from '../src/engine/deckbuilder';
import type { SavedRoster } from '../src/storage/types';

const SEED = 424242;

const players = loadPlayers();
const seats = runHeadlessDraft(players, PLAYS, SEED);

const session: DraftSession = {
  id: 'e2e-season-session',
  timestamp: new Date().toISOString(),
  seats,
  pickLog: [],
};

const humanSeat = seats[0];
const roster: SavedRoster = {
  id: 'e2e-season-roster',
  name: 'E2E Season Fixture',
  timestamp: new Date().toISOString(),
  draftedCards: humanSeat.drafted,
  depthChartOrder: humanSeat.builtRoster.depthChart,
  activePlays: humanSeat.builtRoster.activePlays,
  playAssignments: humanSeat.builtRoster.playAssignments,
  archetypes: humanSeat.builtRoster.archetypes,
  version: 2,
  sessionId: session.id,
};

const season = createSeason(session, roster.id, undefined, 'E2E Test', {
  timestamp: new Date().toISOString(),
});
season.id = 'e2e-season-1';

const bundle = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  sessions: [session],
  seasons: [season],
  rosters: [roster],
};

const outPath = path.resolve(__dirname, '..', 'tests', 'fixtures', 'season-fixture.json');
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
console.log(`Wrote ${outPath}`);
