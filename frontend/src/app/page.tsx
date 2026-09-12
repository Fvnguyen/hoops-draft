'use client';
import Link from 'next/link';
import { PlayerCard, PlayerCardData } from '../components/PlayerCard';
import { getAllCards } from '@/engine/cards';

// Case/diacritic-insensitive name match — the card pool spells some names with
// accents (e.g. "Nikola Jokić") that a hard-coded ASCII lookup would miss.
function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function findCardByName(cards: PlayerCardData[], name: string): PlayerCardData | undefined {
  const target = normalizeName(name);
  return cards.find(c => normalizeName(c.player.name) === target);
}

function byNameSorted(cards: PlayerCardData[], rarity: PlayerCardData['rarity'], excludeIds: Set<string>): PlayerCardData[] {
  return cards
    .filter(c => c.rarity === rarity && !excludeIds.has(c.id))
    .sort((a, b) => a.player.name.localeCompare(b.player.name));
}

/**
 * Pick the hero card: a specific well-known Mythic by name, falling back to
 * the highest-rarity card in the pool if that player isn't in the data
 * (e.g. an offline data refresh drops them).
 */
function pickHero(allCards: PlayerCardData[]): PlayerCardData | undefined {
  const named = findCardByName(allCards, 'Giannis Antetokounmpo');
  if (named) return named;
  const rarityOrder: PlayerCardData['rarity'][] = ['Mythic', 'Rare'];
  for (const rarity of rarityOrder) {
    const pool = byNameSorted(allCards, rarity, new Set());
    if (pool.length > 0) return pool[0];
  }
  return allCards[0];
}

/**
 * Pick 4 pack-preview cards: 2 Mythic + 1 Rare + 1 Uncommon, each from a
 * different team. Preferred well-known names are tried first (by name, so
 * the choice reads as "curated"); if a preferred name is missing or its team
 * collides with an earlier pick, the next card in alphabetical order for
 * that rarity fills the slot instead. Fully deterministic given the static
 * card data — no randomness, so the page never jitters between loads.
 */
function pickPackPreview(allCards: PlayerCardData[], heroId: string | undefined): PlayerCardData[] {
  const tiers: Array<{ rarity: PlayerCardData['rarity']; count: number; preferred: string[] }> = [
    // Only Mythic and Rare cards on the landing page (owner decision): the hero and
    // the pack preview should show the exciting end of the pool.
    { rarity: 'Mythic', count: 2, preferred: ['Nikola Jokić', 'Stephen Curry'] },
    { rarity: 'Rare', count: 2, preferred: ['Anthony Edwards', 'Jalen Brunson'] },
  ];

  const usedIds = new Set<string>(heroId ? [heroId] : []);
  const usedTeams = new Set<string>();
  const picks: PlayerCardData[] = [];

  for (const { rarity, count, preferred } of tiers) {
    const pool = byNameSorted(allCards, rarity, usedIds);
    let picked = 0;

    for (const name of preferred) {
      if (picked >= count) break;
      const card = findCardByName(pool, name);
      if (card && !usedTeams.has(card.player.team)) {
        picks.push(card);
        usedIds.add(card.id);
        usedTeams.add(card.player.team);
        picked++;
      }
    }

    for (const card of pool) {
      if (picked >= count) break;
      if (usedIds.has(card.id) || usedTeams.has(card.player.team)) continue;
      picks.push(card);
      usedIds.add(card.id);
      usedTeams.add(card.player.team);
      picked++;
    }
  }

  return picks;
}

const allCards = getAllCards();
const heroPlayer = pickHero(allCards);
const packPlayers = pickPackPreview(allCards, heroPlayer?.id);

const isDev = process.env.NODE_ENV !== 'production';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-stone-900">
      {/* Background Layer */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/arena_16_9.jpg)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-stone-950 via-stone-900/60 to-stone-950/40" />
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-stone-950 via-transparent to-stone-950/80" />

      <div className="relative z-10 w-full max-w-7xl px-8 flex items-center justify-between h-full min-h-[600px]">

        {/* LEFT COLUMN: Menu */}
        <div className="w-[320px] flex flex-col pt-12 self-stretch justify-center">
          <div className="mb-12">
            <h1 className="text-7xl tracking-tighter leading-none mb-1 italic font-black drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] text-transparent bg-clip-text bg-gradient-to-b from-white via-stone-200 to-stone-400 pr-2" style={{ fontFamily: 'var(--font-bebas)' }}>
              HOOPS DRAFT
            </h1>
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 font-black tracking-[0.25em] text-xl italic drop-shadow-md pr-2">
              ALL-STARS
            </div>
          </div>

          {/* Main Links */}
          <div className="flex flex-col gap-3">
            <Link href="/draft" className="group relative px-6 py-3 bg-gradient-to-r from-blue-900/80 to-blue-800/20 border border-blue-500/50 rounded hover:from-yellow-500/90 hover:to-orange-500/40 hover:border-yellow-400 transition-all">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 group-hover:bg-yellow-400 transition-colors" />
              <span className="font-black text-xl tracking-wider text-blue-100 group-hover:text-white drop-shadow-md italic pr-2">START DRAFT</span>
            </Link>

            <Link href="/rosters" className="group relative px-6 py-3 bg-gradient-to-r from-stone-800/80 to-transparent border border-stone-600/50 rounded hover:from-stone-700 hover:border-stone-400 transition-all">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-stone-600 group-hover:bg-stone-300 transition-colors" />
              <span className="font-black text-lg tracking-wider text-stone-300 group-hover:text-white drop-shadow-md italic pr-2">MY ROSTERS</span>
            </Link>
          </div>
        </div>

        {/* CENTER COLUMN: Hero Card */}
        <div className="flex-1 flex justify-center items-center relative">
          <div className="absolute inset-0 bg-yellow-500/10 blur-[120px] rounded-full scale-150 pointer-events-none" />
          {heroPlayer && (
            <div className="w-[300px] relative z-10 drop-shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:scale-105 transition-transform duration-500 cursor-pointer">
              {/* Haze & Glow Overlay */}
              <div className="absolute inset-0 z-20 pointer-events-none bg-blue-950/15 mix-blend-overlay rounded-xl ring-2 ring-yellow-400/50 shadow-[0_0_30px_rgba(250,204,21,0.2)_inset]"></div>
              <PlayerCard player={heroPlayer} />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Pack Preview */}
        <div className="w-[450px] flex flex-col items-center justify-center pt-8 z-20 shrink-0">
          <h2 className="text-5xl font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-200 drop-shadow-md mb-8 z-20 whitespace-nowrap pr-2" style={{ fontFamily: 'var(--font-bebas)' }}>
            DRAFT PACK
          </h2>

          <div className="relative w-full h-[280px] flex justify-center items-center mt-4">
            {packPlayers.map((p, i) => {
              // Fan the cards out with a visible spread; hovering lifts just
              // that card above its neighbours so its name/stats are legible.
              // 7° per card around a pivot 3 card-heights below the fan keeps the whole
              // fan inside the 450px column (≈ 87px horizontal shift per card at 170px width).
              const angle = (i - (packPlayers.length - 1) / 2) * 9;

              return (
                <div
                  key={p.id}
                  className="absolute top-0 w-[170px] transition-all duration-500 hover:z-50 hover:-translate-y-8 cursor-pointer drop-shadow-xl"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: '50% 300%',
                    zIndex: i + 10
                  }}
                >
                  {/* Subtle Haze Overlay */}
                  <div className="absolute inset-0 z-20 pointer-events-none bg-blue-950/20 mix-blend-overlay rounded-xl ring-1 ring-white/10"></div>
                  <PlayerCard player={p} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dev Tools (build-time only, never shipped to production) */}
      {isDev && (
        <details className="absolute bottom-3 left-3 z-20 group">
          <summary className="list-none cursor-pointer text-[10px] text-stone-500 hover:text-stone-300 font-bold uppercase tracking-widest select-none">
            Dev Tools
          </summary>
          <div className="mt-2 flex flex-col gap-2 pl-2 border-l-2 border-stone-800 bg-stone-950/60 backdrop-blur-sm p-3 rounded">
            <Link href="/deckbuilder-test" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Deckbuilder</Link>
            <Link href="/test-ui" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Test UI</Link>
            <Link href="/data" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Data Viewer</Link>
            <Link href="/debug" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Debug</Link>
          </div>
        </details>
      )}
    </main>
  );
}
