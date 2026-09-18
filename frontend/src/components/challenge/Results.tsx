'use client';

/**
 * challenge_mode T8 — board 7, the results screen at `phase: 'done'`.
 *
 * Mounted by `app/challenge/[rosterId]/page.tsx` in place of `DonePlaceholder`:
 *
 *   } else {
 *     body = <ResultsScreen run={run} />;
 *   }
 *
 * Per D10 this is the LAST screen of a run: grade slam + record on one set of flaps, a
 * win-trend line across all 82 games with a dashed ghost line from game 41 when the front
 * office changed anything, a trade verdict tile, longest streak, season MVP (season
 * averages only — see the no-rating rule below), a seed chip with copy-to-clipboard, a
 * share card panel and a season-stats table, and "Draft a new team". No game log, no
 * per-game drill-in (D10) — that is exactly what makes this screen readable in one glance
 * after 82 games of flip-clock reveal.
 *
 * NEVER show OVR or the seven engine ratings here (owner rule, `AGENTS.md`). Season
 * averages (PPG/RPG/APG/MPG/+-) are the only per-player numbers this screen is allowed
 * to print, all derived from `ChallengePlayerTotals` via `mergePlayerTotals`.
 */

import { useMemo, useState } from 'react';
import { Copy, Check, Share2, ListOrdered, X } from 'lucide-react';
import type { ChallengeRun } from '@/storage/types';
import type { ChallengeGameResult, ChallengePlayerTotals } from '@/engine/challenge';
import { gradeForWins, mergePlayerTotals } from '@/engine/challenge';
import { CHALLENGE_GAMES } from '@/engine/balance';
import { getAllCards } from '@/engine/cards';
import { shortName } from '@/engine/challengeAdvice';
import { TIER_FAMILIES, nextFamilyAbove, TierLadder } from './TierLadder';
import { FlipClock } from './FlipClock';
import { Button, Panel, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';

const HALF_GAMES = CHALLENGE_GAMES / 2; // 41 — the trade-deadline game index (0-based)

// ── pure helpers (no engine/storage side effects, easy to unit-test alongside) ─────────

/** Cumulative wins-losses across a season, index 0 = pregame (0), index k = after game k. */
export function cumulativeDiffs(games: { won: boolean }[]): number[] {
  const out = [0];
  let running = 0;
  for (const g of games) {
    running += g.won ? 1 : -1;
    out.push(running);
  }
  return out;
}

export interface StreakInfo {
  length: number;
  /** 1-based game numbers, inclusive. */
  startGame: number;
  endGame: number;
}

/** Longest run of consecutive wins in a combined W/L string. Ties keep the earliest. */
export function longestStreak(results: string): StreakInfo {
  let best: StreakInfo = { length: 0, startGame: 1, endGame: 0 };
  let runStart = -1;
  for (let i = 0; i < results.length; i++) {
    if (results[i] === 'W') {
      if (runStart === -1) runStart = i;
      const len = i - runStart + 1;
      if (len > best.length) best = { length: len, startGame: runStart + 1, endGame: i + 1 };
    } else {
      runStart = -1;
    }
  }
  return best;
}

/** A short, copyable, case-insensitive-safe rendering of a numeric run seed. Purely a
 *  display format — `run.seed` itself is still the number the engine derives games from,
 *  so copying and pasting this string back to a human, then reading `Number()` off the
 *  digits it's built from, reproduces the exact schedule. */
/**
 * The run's seed as a short shareable code. SEVEN base36 characters, not six: a seed is a
 * full 32-bit value (`randomSeed()` spans 0..4294967295) and 36^6 only reaches ~2.18
 * billion, so six would silently truncate the top of the range and a pasted code would
 * rebuild a DIFFERENT season. One character wider than the board's mock for that reason.
 */
export function formatSeed(seed: number): string {
  const base36 = Math.abs(Math.floor(seed)).toString(36).toUpperCase().padStart(7, '0');
  return `${base36.slice(0, 4)}-${base36.slice(4, 7)}`;
}

/**
 * The inverse of `formatSeed`. The chip COPIES the code it displays, so whatever a player
 * pastes into "enter a seed" is the string they were looking at — copying the raw number
 * behind a stylised code means the thing you share is not the thing you saw. Tolerant of
 * the dash, of lowercase and of surrounding whitespace; returns null for anything that is
 * not a seed, so the caller can tell "bad code" from seed 0.
 */
export function parseSeed(code: string): number | null {
  const cleaned = code.trim().replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-Z]{1,8}$/.test(cleaned)) return null;
  const value = parseInt(cleaned, 36);
  return Number.isFinite(value) ? value : null;
}

const one = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '0.0');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function perGame(t: ChallengePlayerTotals) {
  const g = Math.max(1, t.gamesPlayed);
  return {
    ppg: t.points / g,
    rpg: (t.offensiveRebounds + t.defensiveRebounds) / g,
    apg: t.assists / g,
    mpg: t.minutes / g,
    plusMinus: t.plusMinus / g,
  };
}

// ── win trend chart ─────────────────────────────────────────────────────────────────

function pointsAttr(values: number[], y: (v: number) => number, fromIndex = 0): string {
  return values
    .map((v, i) => `${((i + fromIndex) / CHALLENGE_GAMES) * 1000},${y(v).toFixed(1)}`)
    .join(' ');
}

function WinTrendChart({
  realGames,
  ghostGames,
}: {
  realGames: ChallengeGameResult[];
  ghostGames?: ChallengeGameResult[];
}) {
  const realCum = useMemo(() => cumulativeDiffs(realGames), [realGames]);
  const ghostCum = useMemo(
    () => (ghostGames ? cumulativeDiffs([...realGames.slice(0, HALF_GAMES), ...ghostGames]) : null),
    [realGames, ghostGames],
  );

  const domain = useMemo(() => {
    const all = [0, ...realCum, ...(ghostCum ?? [])];
    const min = Math.min(...all, 0);
    const max = Math.max(...all, 1);
    return { min, max: max === min ? min + 1 : max };
  }, [realCum, ghostCum]);

  const y = (v: number) => 195 - ((v - domain.min) / (domain.max - domain.min)) * 185;

  const finalDiff = realCum[realCum.length - 1] ?? 0;

  return (
    <div className="relative h-[210px] w-full">
      <svg
        width="100%"
        height="200"
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        role="img"
        aria-label="Win trend across all 82 games"
        className="block overflow-visible"
      >
        <line x1="0" y1={y(domain.min)} x2="1000" y2={y(domain.min)} className="stroke-line-strong" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line
          x1={(HALF_GAMES / CHALLENGE_GAMES) * 1000}
          y1="0"
          x2={(HALF_GAMES / CHALLENGE_GAMES) * 1000}
          y2="200"
          className="stroke-line-strong"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        {ghostCum && (
          <polyline
            fill="none"
            className="stroke-ink-subtle"
            strokeWidth="2"
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
            points={pointsAttr(ghostCum.slice(HALF_GAMES), y, HALF_GAMES)}
          />
        )}
        <polyline
          fill="none"
          className="stroke-accent"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          points={pointsAttr(realCum, y)}
        />
      </svg>
      <div className="absolute left-1/2 top-0 translate-x-2 text-xs font-bold text-ink-muted">Trade deadline</div>
      <div className="absolute right-0 -top-1.5 -translate-y-full text-xs font-black text-accent">
        {signed(finalDiff)}
      </div>
    </div>
  );
}

// ── seed chip ────────────────────────────────────────────────────────────────────────

function SeedChip({ seed }: { seed: number }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // The displayed code, not the raw number — see `parseSeed`.
    const text = formatSeed(seed);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('no clipboard API');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be absent (older browsers) or throw (no permission, insecure
      // context); the seed is still visible to copy by hand, so this fails silently.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-ink-subtle">Seed</span>
      <span className="flex h-8 items-center rounded-control border border-line-strong bg-surface-sunken px-2.5 font-mono text-sm font-bold text-ink">
        {formatSeed(seed)}
      </span>
      <IconButton label={copied ? 'Copied' : 'Copy seed'} variant="ghost" onClick={copy}>
        {copied ? <Check className="size-4 text-positive" /> : <Copy className="size-4" />}
      </IconButton>
    </div>
  );
}

// ── season stats panel ──────────────────────────────────────────────────────────────

function SeasonStatsPanel({ totals, onClose }: { totals: ChallengePlayerTotals[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-scrim p-4" onClick={onClose}>
      <Panel
        variant="raised"
        padding="none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-stats-heading"
        className="flex max-h-[calc(85dvh/var(--zoom))] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
          <h2 id="season-stats-heading" className="text-sm font-black uppercase tracking-widest text-ink-strong">
            Season stats
          </h2>
          <div className="grow" />
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-ink-subtle">
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">GP</th>
                <th className="px-3 py-2 text-right">MIN</th>
                <th className="px-3 py-2 text-right">PTS</th>
                <th className="px-3 py-2 text-right">REB</th>
                <th className="px-3 py-2 text-right">AST</th>
                <th className="px-3 py-2 text-right">+/-</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t, i) => {
                const g = perGame(t);
                return (
                  <tr key={t.playerId} className={cn(i % 2 === 1 && 'bg-surface-sunken')}>
                    <td className="px-3 py-2 font-bold text-ink-strong">{t.playerName}</td>
                    <td className="px-3 py-2 text-right text-ink-muted">{t.gamesPlayed}</td>
                    <td className="px-3 py-2 text-right text-ink-muted">{one(g.mpg)}</td>
                    <td className="px-3 py-2 text-right text-ink">{one(g.ppg)}</td>
                    <td className="px-3 py-2 text-right text-ink">{one(g.rpg)}</td>
                    <td className="px-3 py-2 text-right text-ink">{one(g.apg)}</td>
                    <td className={cn('px-3 py-2 text-right', g.plusMinus >= 0 ? 'text-positive' : 'text-danger')}>
                      {signed(Math.round(g.plusMinus))}
                    </td>
                  </tr>
                );
              })}
              {totals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-subtle">No games played.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ── share card panel ─────────────────────────────────────────────────────────────────

function ShareCardPanel({
  run, wins, losses, gradeLabel, gradeTitle, mvpLine, onClose,
}: {
  run: ChallengeRun;
  wins: number;
  losses: number;
  gradeLabel: string;
  gradeTitle: string;
  mvpLine: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareText = `82:0 Challenge — ${gradeLabel} ${gradeTitle} at ${wins}:${losses}` +
    (mvpLine ? ` — MVP ${mvpLine}` : '') + ` — seed ${formatSeed(run.seed)}`;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Best-effort only — the card text is still selectable on screen.
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-scrim p-4" onClick={onClose}>
      <Panel
        variant="raised"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-heading"
        className="flex w-full max-w-md flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 id="share-card-heading" className="text-sm font-black uppercase tracking-widest text-ink-strong">
            Share card
          </h2>
          <div className="grow" />
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-panel border border-accent bg-surface-sunken px-6 py-8">
          <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">82:0 Challenge</span>
          <span className="font-display text-6xl leading-none text-accent">{gradeLabel}</span>
          <span className="font-display text-2xl uppercase tracking-wide text-ink-strong">{gradeTitle}</span>
          <FlipClock wins={wins} losses={losses} size="sm" />
          {mvpLine && <span className="text-xs font-bold text-ink-muted">MVP &middot; {mvpLine}</span>}
          <span className="font-mono text-xs text-ink-subtle">Seed {formatSeed(run.seed)}</span>
        </div>

        <Button variant="secondary" size="lg" icon={copied ? <Check className="size-4" /> : <Share2 className="size-4" />} onClick={copy}>
          {copied ? 'Copied to clipboard' : 'Copy share text'}
        </Button>
      </Panel>
    </div>
  );
}

// ── the screen ───────────────────────────────────────────────────────────────────────

export interface ResultsScreenProps {
  run: ChallengeRun;
}

export function ResultsScreen({ run }: ResultsScreenProps) {
  const [showStats, setShowStats] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const half1 = run.halves[0];
  const half2 = run.halves[1];
  const wins = (half1?.wins ?? 0) + (half2?.wins ?? 0);
  const losses = (half1?.losses ?? 0) + (half2?.losses ?? 0);
  const grade = gradeForWins(wins);

  const combinedResults = `${half1?.results ?? ''}${half2?.results ?? ''}`;
  const streak = useMemo(() => longestStreak(combinedResults), [combinedResults]);

  const seasonTotals = useMemo(() => mergePlayerTotals(run.halves), [run.halves]);
  const mvp = seasonTotals[0] ?? null;
  const mvpPerGame = mvp ? perGame(mvp) : null;
  const mvpLine = mvp ? `${shortName(mvp.playerName)} — ${one(mvpPerGame!.ppg)} PPG, ${one(mvpPerGame!.apg)} APG` : null;

  const next = nextFamilyAbove(wins);
  const gradeSubtitle = next
    ? `${Math.max(0, next.min - wins)} wins short of ${next.title}`
    : TIER_FAMILIES.length > 0
      ? 'The whole ladder, climbed.'
      : null;

  const ghostWinsTotal = run.ghost ? (half1?.wins ?? 0) + run.ghost.wins : undefined;
  const ghostGrade = ghostWinsTotal !== undefined ? gradeForWins(ghostWinsTotal) : null;
  const verdictDiff = ghostWinsTotal !== undefined ? wins - ghostWinsTotal : null;

  const tradeNote = useMemo(() => {
    if (!run.trade) return null;
    const cards = getAllCards();
    const dropped = cards.find((c) => c.id === run.trade!.droppedCardId);
    const acquired = cards.find((c) => c.id === run.trade!.acquiredCardId);
    if (!dropped || !acquired) return null;
    return `${shortName(acquired.player.name)} for ${shortName(dropped.player.name)}.`;
  }, [run.trade]);

  const streakGames = combinedResults.length > 0
    ? `Games ${streak.startGame} to ${streak.endGame}`
    : 'No games played yet';

  return (
    <div className="flex h-dvh-z flex-col">
      <header className="flex h-nav shrink-0 items-center gap-4 border-b border-line pl-6 pr-nav-gear">
        <span className="font-display text-3xl leading-none text-accent">82:0</span>
        <span className="text-xs font-black uppercase tracking-widest text-ink-muted">Season complete</span>
        <div className="grow" />
        <SeedChip seed={run.seed} />
      </header>

      <div className="flex grow flex-col gap-6 overflow-y-auto px-6 py-6 sm:flex-row sm:px-10">
        {/* the slam: grade, title, record on the same flaps */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-5 rounded-panel border border-accent bg-surface-raised px-8 py-8 shadow-[0_0_80px_-20px_var(--accent)] sm:w-[340px]">
          <span className="text-xs font-black uppercase tracking-[0.25em] text-ink-subtle">Final grade</span>
          <span
            className="font-display text-accent"
            style={{ fontSize: '144px', lineHeight: 0.85 }}
          >
            {grade.grade}
          </span>
          <span className="font-display text-4xl uppercase tracking-wide text-ink-strong">{grade.title}</span>
          <FlipClock wins={wins} losses={losses} size="sm" />
          {gradeSubtitle && <p className="text-center text-xs text-ink-muted">{gradeSubtitle}</p>}
        </div>

        {/* the story of the season */}
        <div className="flex min-w-0 grow flex-col gap-5">
          <Panel variant="raised" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">
                Win trend &middot; games above .500
              </span>
              <div className="grow" />
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink-strong">
                <span className="inline-block h-[3px] w-4 rounded-full bg-accent" />
                Your season
              </span>
              {run.ghost && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-ink-subtle" />
                  Without the trade
                </span>
              )}
            </div>
            <WinTrendChart
              realGames={[...(half1?.games ?? []), ...(half2?.games ?? [])]}
              ghostGames={run.ghost?.games}
            />
            <div className="grid grid-cols-3 text-xs font-bold text-ink-subtle">
              <span>Game 1</span>
              <span className="text-center">Game {HALF_GAMES}</span>
              <span className="text-right">Game {CHALLENGE_GAMES}</span>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {run.ghost && verdictDiff !== null && ghostGrade && (
              <Panel variant="raised" className="flex flex-col gap-1 !bg-positive-soft">
                <span className="text-xs font-black uppercase tracking-widest text-positive">Trade verdict</span>
                <span className="font-display text-4xl leading-none text-ink-strong">
                  {signed(verdictDiff)} wins
                </span>
                <span className="text-xs text-ink">
                  {tradeNote ?? 'Front office changes.'} Without it: {(half1?.wins ?? 0) + (run.ghost.wins)}:
                  {(half1?.losses ?? 0) + run.ghost.losses}, {ghostGrade.title}.
                </span>
              </Panel>
            )}
            <Panel variant="raised" className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Longest streak</span>
              <span className="font-display text-4xl leading-none text-ink-strong">{streak.length} straight</span>
              <span className="text-xs text-ink-muted">{streakGames}</span>
            </Panel>
            <Panel variant="raised" className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Season MVP</span>
              <span className="font-display truncate text-4xl leading-none text-ink-strong">
                {mvp ? shortName(mvp.playerName) : 'No games played'}
              </span>
              {mvp && mvpPerGame && (
                <span className="text-xs text-ink-muted">
                  {one(mvpPerGame.ppg)} points, {one(mvpPerGame.apg)} assists per game
                </span>
              )}
            </Panel>
          </div>

          <div className="grow" />

          <TierLadder wins={wins} ghostWins={ghostWinsTotal} className="w-full" />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="lg" icon={<Share2 className="size-4" />} onClick={() => setShowShare(true)}>
              Share card
            </Button>
            <Button variant="secondary" size="lg" icon={<ListOrdered className="size-4" />} onClick={() => setShowStats(true)}>
              Season stats
            </Button>
            <div className="grow" />
            <Button href="/rosters" size="lg">End Challenge — Results Locked In</Button>
          </div>
        </div>
      </div>

      {showStats && <SeasonStatsPanel totals={seasonTotals} onClose={() => setShowStats(false)} />}
      {showShare && (
        <ShareCardPanel
          run={run}
          wins={wins}
          losses={losses}
          gradeLabel={grade.grade}
          gradeTitle={grade.title}
          mvpLine={mvpLine}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
