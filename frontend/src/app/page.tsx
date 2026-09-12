'use client';
import Link from 'next/link';
import { PlayerCard, PlayerCardData } from '../components/PlayerCard';

const mockPlayer = (name: string, pos: string, ovr: number, id: string, rarity: any = 'Rare', team: string = 'LAL'): PlayerCardData => ({
  type: 'Player',
  id: id,
  rarity,
  player: {
    id,
    name,
    position: pos,
    team,
    age: 28,
  },
  ratings: {
    overall: ovr,
    finishing: 90,
    midRange: 85,
    perimeter: 88,
    playmaking: 85,
    perimeterDefense: 82,
    postDefense: 75,
    rebounding: 80
  },
  stats: {
    pts: 28.5,
    trb: 8.2,
    ast: 6.7,
    stl: 1.2,
    blk: 0.8,
    fg_pct: 0.52,
    mpg: 34,
    gp: 78
  },
  traits: [
    { name: 'Finisher', level: 3 },
    { name: 'Floor General', level: 2 }
  ]
} as any);

const heroPlayer = mockPlayer('LeBron James', 'SF', 95, '1626157', 'Mythic');
const packPlayers = [
  mockPlayer('Stephen Curry', 'PG', 93, '1626145', 'Mythic', 'GSW'),
  mockPlayer('James Harden', 'SG', 90, '1626156', 'Rare', 'PHI'),
  mockPlayer('Kevin Durant', 'PF', 94, '1626162', 'Mythic', 'PHX'),
  mockPlayer('Nikola Jokic', 'C', 96, '1626164', 'Mythic', 'DEN'),
];

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

          {/* Dev Links */}
          <div className="mt-16">
             <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-3">Dev Tools</div>
             <div className="flex flex-col gap-2 pl-2 border-l-2 border-stone-800">
                <Link href="/deckbuilder-test" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Deckbuilder</Link>
                <Link href="/test-ui" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Test UI</Link>
                <Link href="/data" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Data Viewer</Link>
                <Link href="/debug" className="text-xs font-bold text-stone-400 hover:text-stone-200 uppercase tracking-widest">Debug</Link>
             </div>
          </div>
        </div>

        {/* CENTER COLUMN: Hero Card */}
        <div className="flex-1 flex justify-center items-center relative">
          <div className="absolute inset-0 bg-yellow-500/10 blur-[120px] rounded-full scale-150 pointer-events-none" />
          <div className="w-[300px] relative z-10 drop-shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:scale-105 transition-transform duration-500 cursor-pointer">
            {/* Haze & Glow Overlay */}
            <div className="absolute inset-0 z-20 pointer-events-none bg-blue-950/15 mix-blend-overlay rounded-xl ring-2 ring-yellow-400/50 shadow-[0_0_30px_rgba(250,204,21,0.2)_inset]"></div>
            <PlayerCard player={heroPlayer} />
          </div>
        </div>

        {/* RIGHT COLUMN: Pack Preview */}
        <div className="w-[450px] flex flex-col items-center justify-center pt-8 z-20 shrink-0">
          <h2 className="text-5xl font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-200 drop-shadow-md mb-8 z-20 whitespace-nowrap pr-2" style={{ fontFamily: 'var(--font-bebas)' }}>
            DRAFT PACK
          </h2>
          
          <div className="relative w-full h-[250px] flex justify-center items-center mt-4">
            {packPlayers.map((p, i) => {
              // Keep the fan compact with a small overlap between cards.
              const angle = (i - 1.5) * 4.5;
              
              return (
                <div 
                  key={p.id}
                  className="absolute top-0 w-[140px] transition-all duration-500 hover:z-50 hover:-translate-y-6 cursor-pointer drop-shadow-xl"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: '50% 650%',
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
    </main>
  );
}
