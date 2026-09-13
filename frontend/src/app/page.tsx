'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlayerCard, PlayerCardData } from '../components/PlayerCard';
import { getAllCards } from '@/engine/cards';

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick a random Mythic as the hero card, falling back to any card if the pool is empty. */
function pickHero(allCards: PlayerCardData[]): PlayerCardData | undefined {
  const mythics = allCards.filter(c => c.rarity === 'Mythic');
  return shuffled(mythics)[0] ?? allCards[0];
}

/**
 * Pick 4 random pack-preview cards from Mythic + Rare (2 of each, owner
 * decision to keep the landing page to the exciting end of the pool), each
 * from a different team where possible. Re-rolled on every page load.
 */
function pickPackPreview(allCards: PlayerCardData[], heroId: string | undefined): PlayerCardData[] {
  const usedIds = new Set<string>(heroId ? [heroId] : []);
  const usedTeams = new Set<string>();
  const picks: PlayerCardData[] = [];

  const tiers: Array<{ rarity: PlayerCardData['rarity']; count: number }> = [
    { rarity: 'Mythic', count: 2 },
    { rarity: 'Rare', count: 2 },
  ];

  for (const { rarity, count } of tiers) {
    const pool = shuffled(allCards.filter(c => c.rarity === rarity && !usedIds.has(c.id)));
    let picked = 0;

    for (const card of pool) {
      if (picked >= count) break;
      if (usedTeams.has(card.player.team)) continue;
      picks.push(card);
      usedIds.add(card.id);
      usedTeams.add(card.player.team);
      picked++;
    }

    // Not enough distinct-team cards left in this rarity — allow a team repeat
    // rather than shorting the preview.
    for (const card of pool) {
      if (picked >= count) break;
      if (usedIds.has(card.id)) continue;
      picks.push(card);
      usedIds.add(card.id);
      picked++;
    }
  }

  return picks;
}

const allCards = getAllCards();

const isDev = process.env.NODE_ENV !== 'production';

export default function Home() {
  // Re-rolled client-side (not at module scope) so every visit gets a fresh
  // draw without the server-rendered and hydrated picks ever mismatching.
  const [showcase, setShowcase] = useState<{ hero: PlayerCardData | undefined; pack: PlayerCardData[] } | null>(null);

  useEffect(() => {
    const hero = pickHero(allCards);
    setShowcase({ hero, pack: pickPackPreview(allCards, hero?.id) });
  }, []);

  const heroPlayer = showcase?.hero;
  const packPlayers = showcase?.pack ?? [];

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
            <Link
              href="/draft?mode=premier"
              data-testid="cta-premier"
              className="group relative px-6 py-3.5 bg-gradient-to-r from-yellow-500/90 to-orange-600/70 border border-yellow-400/60 rounded hover:from-yellow-400 hover:to-orange-500 transition-all shadow-[0_0_25px_rgba(234,179,8,0.25)]"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-300" />
              <span className="font-black text-xl tracking-wider text-white drop-shadow-md italic pr-2">PREMIER DRAFT</span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-50/90 pr-2">Timed picks · round summaries</div>
            </Link>

            <Link
              href="/draft?mode=quick"
              data-testid="cta-quick"
              className="group relative px-6 py-3 bg-gradient-to-r from-blue-900/80 to-blue-800/20 border border-blue-500/50 rounded hover:from-stone-700 hover:border-stone-400 transition-all"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 group-hover:bg-stone-300 transition-colors" />
              <span className="font-black text-lg tracking-wider text-blue-100 group-hover:text-white drop-shadow-md italic pr-2">QUICK DRAFT</span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-100/80 pr-2">No timer · quick animations</div>
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
