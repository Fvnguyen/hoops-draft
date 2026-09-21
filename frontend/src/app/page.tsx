'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlayerCard, PlayerCardData } from '../components/PlayerCard';
import showcaseCards from '@/data/showcase.json';
import { Button, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { HomeModePicker, type HomeGame } from '@/components/HomeModePicker';

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

// plan_mobile_load D2: the home page only ever draws Mythic/Rare cards (owner decision,
// keeps re-rolling on every visit), so it imports the pre-filtered `showcase.json`
// (~41 KB for 35 cards) instead of the full 482 KB card set via `getAllCards()`. Same
// shape as `PlayerCardData` (same build-time tagging in `scripts/build-cards.ts`) — go
// through `unknown` for the same "trust the build artifact's shape" cast `cards.ts` uses.
const allCards = showcaseCards as unknown as PlayerCardData[];

const isDev = process.env.NODE_ENV !== 'production';

export default function Home() {
  // Re-rolled client-side (not at module scope) so every visit gets a fresh
  // draw without the server-rendered and hydrated picks ever mismatching —
  // the standard "randomize after mount" exception to setState-in-effect
  // (there's no prop/event this could instead derive from; it's synchronizing
  // with a fresh Math.random() draw, not adjusting state from a render input).
  const [showcase, setShowcase] = useState<{ hero: PlayerCardData | undefined; pack: PlayerCardData[] } | null>(null);
  // plan_challenge_mode D1: which mode's picker is open, if any. Clicking a mode
  // button opens its picker and dims the other; "Back" (or picking the same mode
  // again) closes it. No post-draft mode choice — this is the only place it's picked.
  const [openPicker, setOpenPicker] = useState<HomeGame | null>(null);

  useEffect(() => {
    const hero = pickHero(allCards);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setShowcase({ hero, pack: pickPackPreview(allCards, hero?.id) });
  }, []);

  const heroPlayer = showcase?.hero;
  const packPlayers = showcase?.pack ?? [];

  return (
    <main className="relative flex min-h-dvh-z items-center justify-center overflow-x-hidden overflow-y-auto bg-surface-inverse-deep">
      {/* Background Layer */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/art/arena-1600.webp)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-surface-inverse-deep via-surface-inverse/60 to-surface-inverse-deep/40" />
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-surface-inverse-deep via-transparent to-surface-inverse-deep/80" />

      {/* game_canvas T0b: the 600px floor is lg-only so the menu fits a phone-landscape
          viewport (385px real, 550px at zoom 0.7) with no page scroll. */}
      <div className="relative z-10 flex h-full w-full max-w-7xl items-center justify-between px-8 lg:min-h-[600px]">

        {/* LEFT COLUMN: Menu */}
        <div className="flex w-[340px] shrink-0 flex-col self-stretch justify-center pt-6 lg:pt-12">
          <div className="mb-6 lg:mb-12">
            <h1 className="mb-1 bg-gradient-to-b from-ink-inverse to-ink-inverse-muted bg-clip-text pr-2 text-7xl italic font-black leading-none tracking-tighter text-transparent drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-bebas)' }}>
              HOOPS DRAFT
            </h1>
            <div className="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text pr-2 text-xl font-black italic tracking-[0.25em] text-transparent drop-shadow-md">
              ALL-STARS
            </div>
          </div>

          {/* Main Links */}
          <div className="flex flex-col gap-3">
            {/* plan_challenge_mode D1: mode is chosen before the draft. These two
                replace the old Premier/Quick CTAs; picking one opens its own
                Premier-vs-Quick picker (HomeModePicker) and dims the other. */}
            <Button
              data-testid="cta-tournament"
              onClick={() => setOpenPicker('tournament')}
              variant="primary"
              size="stacked"
              className={cn(
                'group relative w-full flex-col items-start gap-0.5 whitespace-normal rounded text-left normal-case tracking-normal transition-opacity',
                'border border-accent/60 bg-surface shadow-[0_0_25px_rgba(234,179,8,0.25)] hover:bg-surface-raised',
                openPicker === 'challenge' && 'opacity-40',
              )}
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-accent" />
              <span className="text-xl font-black italic tracking-wider text-ink-strong drop-shadow-md">IN-SEASON TOURNAMENT</span>
              <span className="text-xs font-bold uppercase tracking-widest text-ink-muted">7 games vs your draft table · watch them all</span>
            </Button>

            <Button
              data-testid="cta-challenge"
              onClick={() => setOpenPicker('challenge')}
              variant="secondary"
              size="stacked"
              className={cn(
                'group relative w-full flex-col items-start gap-0.5 whitespace-normal rounded text-left normal-case tracking-normal transition-opacity',
                'border border-accent bg-surface-inverse-deep text-ink-inverse shadow-[0_0_25px_rgba(251,191,36,0.15)] hover:bg-surface-inverse',
                openPicker === 'tournament' && 'opacity-40',
              )}
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-accent" />
              <span className="flex items-baseline gap-2.5">
                <span className="font-display text-3xl leading-none text-accent">82:0</span>
                <span className="text-xl font-black italic tracking-wider text-ink-inverse drop-shadow-md">CHALLENGE</span>
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-ink-inverse-muted">82 games vs the real NBA · one trade · one grade</span>
            </Button>

            <Link
              href="/rosters"
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'stacked' }),
                'group relative w-full items-center justify-start rounded text-left normal-case tracking-normal',
                'border border-line-inverse/50 bg-gradient-to-r from-surface-inverse/80 to-transparent text-ink-inverse-muted hover:border-line-strong hover:from-surface-sunken',
              )}
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-line-inverse group-hover:bg-ink-inverse-muted" />
              <span className="text-lg font-black italic tracking-wider drop-shadow-md group-hover:text-ink-inverse">MY ROSTERS</span>
            </Link>
          </div>
        </div>

        {/* CENTER COLUMN: Hero Card */}
        <div className="relative flex flex-1 items-center justify-center">
          {/* No `scale-150` on the glow: a transformed box adds scrollable overflow (~40px on
              a phone, i.e. a page scroll). A wider blur reaches the same look without it. */}
          <div className="pointer-events-none absolute inset-0 rounded-full bg-accent/10 blur-[160px]" />
          {heroPlayer && (
            <div className="relative z-10 w-[300px] cursor-pointer drop-shadow-[0_0_25px_rgba(234,179,8,0.4)] transition-transform duration-500 hover:scale-105">
              {/* Haze & Glow Overlay */}
              <div className="pointer-events-none absolute inset-0 z-20 rounded-xl bg-info/15 mix-blend-overlay shadow-[0_0_30px_rgba(250,204,21,0.2)_inset] ring-2 ring-accent/50"></div>
              <PlayerCard player={heroPlayer} />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Pack Preview */}
        {/* game_canvas T1: 320 + 300 + 450px columns never fit under 1134px on a non-touch
            narrow window, so the fan stays lg-only there. On a touch phone below lg (where
            zoom:0.7 gives ~1186 CSS px at 830 real, ~1114 at 780 real) show it too, shrunk
            to a 380px column — 320+300+380+64=1064, fits both. The fan cards themselves are
            scaled from 170px to 130px (0.7647x) so the rotated-fan footprint, which scales
            linearly with card width (card height, and the 300%-of-height pivot distance,
            are both derived from the width via the fixed 5/7 aspect ratio), shrinks from
            ≤450px-wide at 170px to ≤450*0.7647≈344px at 130px — comfortably inside the
            380px column with margin to spare. */}
        <div className="z-20 hidden w-[450px] shrink-0 flex-col items-center justify-center pt-8 lg:flex pointer-coarse:max-lg:flex! pointer-coarse:max-lg:w-[380px]! pointer-coarse:max-lg:min-w-0!">
          <h2 className="z-20 mb-8 whitespace-nowrap bg-gradient-to-b from-ink-inverse to-info-soft bg-clip-text pr-2 text-5xl font-black italic tracking-tight text-transparent drop-shadow-md" style={{ fontFamily: 'var(--font-bebas)' }}>
            DRAFT PACK
          </h2>

          <div className="relative mt-4 flex h-[280px] w-full items-center justify-center pointer-coarse:max-lg:h-[220px]!">
            {packPlayers.map((p, i) => {
              // Fan the cards out with a visible spread; hovering lifts just
              // that card above its neighbours so its name/stats are legible.
              // 7° per card around a pivot 3 card-heights below the fan keeps the whole
              // fan inside the 450px column (≈ 87px horizontal shift per card at 170px width).
              const angle = (i - (packPlayers.length - 1) / 2) * 9;

              return (
                <div
                  key={p.id}
                  className="absolute top-0 w-[170px] cursor-pointer transition-all duration-500 hover:z-50 hover:-translate-y-8 drop-shadow-xl pointer-coarse:max-lg:w-[130px]!"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: '50% 300%',
                    zIndex: i + 10
                  }}
                >
                  {/* Subtle Haze Overlay */}
                  <div className="pointer-events-none absolute inset-0 z-20 rounded-xl bg-info/20 mix-blend-overlay ring-1 ring-white/10"></div>
                  <PlayerCard player={p} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {openPicker && <HomeModePicker game={openPicker} onClose={() => setOpenPicker(null)} />}

      {/* Dev Tools (build-time only, never shipped to production) */}
      {isDev && (
        <details className="group absolute bottom-3 left-3 z-20">
          <summary className="list-none cursor-pointer select-none text-xs font-bold uppercase tracking-widest text-ink-inverse-muted hover:text-ink-inverse">
            Dev Tools
          </summary>
          <div className="mt-2 flex flex-col gap-1 rounded border-l-2 border-line-inverse bg-surface-inverse-deep/60 pl-2 backdrop-blur-sm">
            {[
              { href: '/deckbuilder-test', label: 'Deckbuilder' },
              { href: '/test-ui', label: 'Test UI' },
              { href: '/data', label: 'Data Viewer' },
              { href: '/debug', label: 'Debug' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-control w-44 items-center px-2 text-xs font-bold uppercase tracking-widest text-ink-inverse-muted hover:text-ink-inverse"
              >
                {label}
              </Link>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
