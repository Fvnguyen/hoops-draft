/**
 * Archetype feasibility: how reachable each identity is for (a) PER-drafting bots and
 * (b) a "focused" drafter who chases one colour, under the CURRENT thresholds in
 * engine/archetypes.ts. Use it whenever thresholds, the card pool, or pack composition
 * change. Run: npm run feasibility -- 100   (drafts per colour; ~1 min at 100)
 *
 * Targets agreed 2026-09-13: focused drafter Online ~85-95% / Dedicated ~40-60% on the
 * offensive colours; bots Online ~25-35% / Dedicated ~5%.
 */
import { generateCubePool, getBotPick, type DraftSeat } from '../src/engine/draft';
import { createRng } from '../src/engine/rng';
import { getAllCards } from '../src/engine/cards';
import { buildBotRoster } from '../src/engine/deckbuilder';
import { evaluateArchetypes, shortlistArchetypes, MONO_THRESHOLDS, COLORS, type Color } from '../src/engine/archetypes';
import { CUBE_PLAYER_CARDS_PER_PACK } from '../src/engine/balance';
import { PLAYS } from '../tests/unit/fixtures/plays';
import type { DraftCard, PlayerCardData } from '../src/engine/types';

const N = Number(process.argv[2] ?? 150);
const players = getAllCards();
const PICKS = CUBE_PLAYER_CARDS_PER_PACK + 1;

function level(c: DraftCard, color: Color): number {
  return c.type === 'Player' ? (c.traits.find(t => t.name === color)?.level ?? 0) : 0;
}

/** Seat 0 chases `color`: highest badge level of that colour, tie-break PER; plays only if nothing carries the colour and the pack has < 3 plays taken. */
function focusedPick(seat: DraftSeat, color: Color): string {
  let best: DraftCard | null = null; let bestScore = -1;
  for (const c of seat.currentPack) {
    const lv = level(c, color);
    const per = c.type === 'Player' ? (c.stats?.per ?? 0) : 0;
    const score = lv * 100 + per;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best ? best.id : seat.currentPack[0].id;
}

function runDraft(seed: number, color: Color | null) {
  const rng = createRng(seed);
  const packs = generateCubePool(players, PLAYS, rng);
  const seats: DraftSeat[] = [];
  for (let i = 0; i < 8; i++) {
    seats.push({ id: i === 0 ? 'human-0' : `bot-${i}`, isBot: true, botProfile: { id: `bot-${i}`, name: `B${i}`, noiseSeed: Math.floor(rng.next() * 1e6), favoredTrait: 'Sharpshooter' }, drafted: [], currentPack: packs[i] });
  }
  let overall = 1;
  for (let pack = 1; pack <= 3; pack++) {
    for (let pick = 1; pick <= PICKS; pick++) {
      for (let i = 0; i < 8; i++) {
        const seat = seats[i];
        if (seat.currentPack.length === 0) continue;
        const id = i === 0 && color ? focusedPick(seat, color) : getBotPick(seat, overall);
        const idx = seat.currentPack.findIndex(c => c.id === id);
        if (idx >= 0) seat.drafted.push(seat.currentPack.splice(idx, 1)[0]);
      }
      const dir = pack === 2 ? 1 : -1;
      const rotated: DraftCard[][] = new Array(8);
      for (let i = 0; i < 8; i++) rotated[((i + dir) % 8 + 8) % 8] = seats[i].currentPack;
      for (let i = 0; i < 8; i++) seats[i].currentPack = rotated[i];
      overall++;
    }
    if (pack < 3) for (let i = 0; i < 8; i++) seats[i].currentPack = packs[pack * 8 + i];
  }
  return seats;
}

function monoStatus(seat: DraftSeat, color: Color) {
  const roster = buildBotRoster(seat.drafted, seat.botProfile);
  const byId = new Map(seat.drafted.map(c => [c.id, c]));
  const active = Object.values(roster.depthChart).flat().map(id => byId.get(id)).filter((c): c is PlayerCardData => !!c && c.type === 'Player');
  const starters = new Set(Object.values(roster.depthChart).map(ids => ids[0]).filter(Boolean));
  const statuses = evaluateArchetypes(active, starters);
  const st = statuses.find(s => s.def.kind === 'mono' && s.def.colors.primary === color)!;
  return st.tier;
}


console.log('=== CURRENT thresholds (mono) ===');
console.log('colour'.padEnd(20), 'focused online%'.padEnd(17), 'focused dedic%'.padEnd(16), 'bot online%'.padEnd(13), 'bot dedic%');
for (const color of COLORS) {
  let fOn = 0, fDed = 0, bOn = 0, bDed = 0, bSeats = 0;
  for (let d = 0; d < N; d++) {
    const seats = runDraft(1000 + d, color);
    const t = monoStatus(seats[0], color);
    if (t !== 'none') fOn++;
    if (t === 'dedicated') fDed++;
    for (let i = 1; i < 8; i++) { const bt = monoStatus(seats[i], color); bSeats++; if (bt !== 'none') bOn++; if (bt === 'dedicated') bDed++; }
  }
  const pct = (a: number, b: number) => ((100 * a) / b).toFixed(0).padStart(3) + '%';
  console.log(color.padEnd(20), pct(fOn, N).padEnd(17), pct(fDed, N).padEnd(16), pct(bOn, bSeats).padEnd(13), pct(bDed, bSeats));
}
// Two-colour / gold: focused drafter chasing the PRIMARY colour, any non-mono plan reached
console.log('=== CURRENT thresholds (two-colour / gold, focused on primary colour) ===');
for (const color of COLORS) {
  const reached: Record<string, number> = {};
  for (let d = 0; d < N; d++) {
    const seats = runDraft(1000 + d, color);
    const roster = buildBotRoster(seats[0].drafted, seats[0].botProfile);
    const byId = new Map(seats[0].drafted.map(c => [c.id, c]));
    const active = Object.values(roster.depthChart).flat().map(id => byId.get(id)).filter((c): c is PlayerCardData => !!c && c.type === 'Player');
    const starters = new Set(Object.values(roster.depthChart).map(ids => ids[0]).filter(Boolean));
    for (const st of evaluateArchetypes(active, starters)) {
      if (st.def.kind !== 'mono' && st.def.colors.primary === color && st.tier !== 'none') reached[st.def.name] = (reached[st.def.name] ?? 0) + 1;
    }
  }
  const line = Object.entries(reached).map(([n, c]) => `${n} ${((100 * c) / N).toFixed(0)}%`).join(', ') || '(none)';
  console.log(color.padEnd(20), line);
}

// How many plans does a roster unlock in total (before / after the shortlist cap)?
console.log('=== unlocked plans per roster (mean / max) ===');
{
  let fU = 0, fS = 0, fMax = 0, bU = 0, bS = 0, bMax = 0, fN = 0, bN = 0;
  for (let d = 0; d < N; d++) {
    const color = COLORS[d % COLORS.length];
    const seats = runDraft(3000 + d, color);
    for (let i = 0; i < 8; i++) {
      const roster = buildBotRoster(seats[i].drafted, seats[i].botProfile);
      const byId = new Map(seats[i].drafted.map(c => [c.id, c]));
      const active = Object.values(roster.depthChart).flat().map(id => byId.get(id)).filter((c): c is PlayerCardData => !!c && c.type === 'Player');
      const starters = new Set(Object.values(roster.depthChart).map(ids => ids[0]).filter(Boolean));
      const st = evaluateArchetypes(active, starters);
      const unlocked = st.filter(x => x.tier !== 'none').length;
      const shortlisted = shortlistArchetypes(st).length;
      if (i === 0) { fU += unlocked; fS += shortlisted; fMax = Math.max(fMax, unlocked); fN++; }
      else { bU += unlocked; bS += shortlisted; bMax = Math.max(bMax, unlocked); bN++; }
    }
  }
  console.log(`focused drafter: unlocked mean ${(fU / fN).toFixed(2)} (max ${fMax}), shown mean ${(fS / fN).toFixed(2)}`);
  console.log(`bots:            unlocked mean ${(bU / bN).toFixed(2)} (max ${bMax}), shown mean ${(bS / bN).toFixed(2)}`);
}
