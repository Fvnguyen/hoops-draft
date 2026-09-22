'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { GameTheater, TeamInfo, PossessionEvent, boxScoreThrough } from '../engine/game';
import type { StoredGameResult } from '../engine/season';
import { Play as PlayIcon, Pause, SkipForward, ArrowDown } from 'lucide-react';
import { calcRosterIdentity, resolveDepthChart } from '../engine/rosterStats';
import { evaluateArchetypes, type ArchetypeStatus, type ArchetypeTier } from '../engine/archetypes';
import type { PlaybookStatus, PlayStatus } from '../engine/playbook';
import { MiniPlayerCard, type PlayerCardData } from './PlayerCard';
import { Button, Panel } from './ui';
import { cn } from '@/lib/cn';
import { renderTheater } from '../narration/render';
import { computeBeats, renderBeat } from '../narration/beats';
import { summarizeGame } from '../narration/summary';
import type { Beat, GameContext, Side } from '../narration/types';
import { BoxScoreTable, GameSummaryPanel, SIDE_CHIP, SIDE_TEXT } from './BoxScore';

/** The season's human seat id (engine/season.ts HUMAN_SEAT_ID) — the default "you". */
const DEFAULT_USER_SEAT = 'human-0';

// ── Dev-only render instrumentation (T11) ──────────────────────────────────────
//
// Proves the memoization below instead of asserting it: `tests/game-view-render.spec.ts`
// reads this off `window` while a game plays out and checks that `TeamBlock`'s render
// count rises far slower than the possession counter. Compiled away in production builds
// (`process.env.NODE_ENV` is statically replaced, so the dead branch is eliminated).
declare global {
  interface Window {
    __gameViewRenderCounts?: Record<string, number>;
  }
}

function bumpRenderCount(name: string): void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return;
  window.__gameViewRenderCounts = window.__gameViewRenderCounts ?? {};
  window.__gameViewRenderCounts[name] = (window.__gameViewRenderCounts[name] ?? 0) + 1;
}

interface GameViewProps {
  game: GameTheater;
  /** Fires synchronously (no delay) whenever `isComplete` changes, so a caller can gate
   *  UI — e.g. an exit control — on whether the game has actually finished playing out. */
  onCompletionChange?: (isComplete: boolean) => void;
  /** D11: season record/streak/rank for the header; absent = exhibition. */
  context?: GameContext;
  /** Fixtures/screenshots only (/theater-preview, scripts/theater-shot.ts): open the view
   *  already advanced to a possession, on a tab, optionally with the crunch pop-up up. */
  initialState?: { possession?: number; tab?: 'playByPlay' | 'boxScore' | 'matchup'; crunchPopup?: boolean };
  /** pvp_series D3 reveal gate: the opponent's side in a Playoffs game. When set, that side's
   *  bench, plays and identity are never listed; before tip-off only its five starters show
   *  (as the tournament matchup preview shows them); the box score reveals who played.
   *  Absent (every non-Playoffs caller) = today's view, unchanged. Wired in pvp_series T4. */
  hideOpponentDetails?: 'home' | 'away';
}

const TIER_LABEL: Record<ArchetypeTier, string> = { none: 'NONE', online: 'ONLINE', dedicated: 'DEDICATED' };
const TIER_CLASS: Record<ArchetypeTier, string> = {
  none: 'bg-surface-muted text-ink-subtle',
  online: 'bg-positive-soft text-positive',
  dedicated: 'bg-warn-soft text-warn',
};

/** D6: playback speeds in ms per possession. "End" is not a speed (D6). */
const SPEEDS = [
  { label: '1×', ms: 500 },
  { label: '2×', ms: 250 },
  { label: '4×', ms: 125 },
] as const;
const CRUNCH_POPUP_MS = 1500;

/** Stable fallback for `liveBox` on ticks where it isn't needed (D9) — a fixed reference
 *  so the `useMemo` it lives in doesn't itself churn the render when gated off. */
const EMPTY_BOX: ReturnType<typeof boxScoreThrough> = { home: [], away: [] };

function playerName(players: PlayerCardData[], id?: string): string {
  if (!id) return 'Unassigned';
  return players.find(p => p.id === id)?.player.name ?? 'Unknown';
}

function playRoleSummary(status: PlayStatus, players: PlayerCardData[]): string {
  return status.roles.map(r => `${r.role.name}: ${playerName(players, r.playerId)}`).join(', ');
}

/** A team's selected archetype(s) (Offense/Defense Philosophy, or one Gold plan), evaluated. */
function teamArchetypeStatuses(team: TeamInfo): ArchetypeStatus[] {
  const statuses = evaluateArchetypes(team.players, new Set(team.starters));
  const byId = new Map(statuses.map(s => [s.def.id, s]));
  const selection = team.archetypes;
  const selected: ArchetypeStatus[] = [];
  if (selection?.gold) {
    const s = byId.get(selection.gold);
    if (s) selected.push(s);
  } else {
    if (selection?.offense) { const s = byId.get(selection.offense); if (s) selected.push(s); }
    if (selection?.defense) { const s = byId.get(selection.defense); if (s) selected.push(s); }
  }
  return selected;
}

function abbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '???';
}

/** "You win" / "Astro wins": the human team is literally named "You" by default. */
function winsVerb(name: string): string {
  return name.trim().toLowerCase() === 'you' ? 'win' : 'wins';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function TeamStarters({ team, isHome }: { team: TeamInfo; isHome: boolean }) {
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const resolvedDepth = resolveDepthChart(team.players, team.depthChart);
  return (
    <div className={`flex ${isHome ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
      {positions.map((pos, idx) => {
        const starter = resolvedDepth[pos]?.[0];
        if (!starter) return null;
        return (
          <div
            key={pos}
            className="relative transition-transform hover:-translate-y-2 hover:z-20"
            style={{
              marginLeft: idx === 0 ? '0' : '-1.5rem',
              zIndex: isHome ? 10 - idx : idx,
            }}
          >
            <MiniPlayerCard player={starter} className="shadow-md hover:shadow-xl" />
          </div>
        );
      })}
    </div>
  );
}

function TeamMechanics({ team, playbook }: { team: TeamInfo; playbook: PlaybookStatus }) {
  const archetypes = teamArchetypeStatuses(team);
  const activePlays = playbook.plays.filter(p => p.active);
  return (
    <div className="space-y-1 text-xs">
      {archetypes.map(s => (
        <div key={s.def.id} className="text-ink-muted flex items-center gap-1.5">
          <span className="text-positive text-xs">✦</span> {s.def.name}
          <span className={`text-xs font-black uppercase tracking-wide px-1 py-0.5 rounded ${TIER_CLASS[s.tier]}`}>{TIER_LABEL[s.tier]}</span>
        </div>
      ))}
      {activePlays.map(p => (
        <div key={p.assignment.cardId} className="text-ink-muted flex items-start gap-1.5">
          <span className="text-warn text-xs mt-0.5">▶</span>
          <span>Play: {p.def.name} — {playRoleSummary(p, team.players)}</span>
        </div>
      ))}
      {archetypes.length === 0 && activePlays.length === 0 && <div className="text-ink-subtle italic">No identity or active plays yet.</div>}
    </div>
  );
}

/** pvp_series D3: stands in for `TeamMechanics` on the opponent's side under the reveal
 *  gate — no identity, no plays, nothing to infer their build from. */
function HiddenTeamMechanics() {
  return <div className="text-xs text-ink-subtle italic">Hidden until the box score.</div>;
}

export const TaleOfTheTape = memo(function TaleOfTheTape({ game, hideSide }: { game: GameTheater; hideSide?: Side }) {
  const homeDepth = resolveDepthChart(game.homeTeam.players, game.homeTeam.depthChart);
  const homeId = calcRosterIdentity(homeDepth);
  const awayDepth = resolveDepthChart(game.awayTeam.players, game.awayTeam.depthChart);
  const awayId = calcRosterIdentity(awayDepth);

  const bars = [
    { label: 'Finishing', h: homeId.finishing, a: awayId.finishing, color: 'var(--accent)' },
    { label: 'Mid-Range', h: homeId.midRange, a: awayId.midRange, color: 'var(--accent)' },
    { label: '3PT', h: homeId.perimeter, a: awayId.perimeter, color: 'var(--accent)' },
    { label: 'Perimeter D', h: homeId.perDef, a: awayId.perDef, color: 'var(--info)' },
    { label: 'Post Def', h: homeId.postDef, a: awayId.postDef, color: 'var(--info)' },
    { label: 'Playmaking', h: homeId.playmaking, a: awayId.playmaking, color: 'var(--positive)' },
    { label: 'Rebounding', h: homeId.rebounding, a: awayId.rebounding, color: 'var(--positive)' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 bg-surface-sunken overflow-y-auto h-full">
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-2"><span className={cn('mr-1', SIDE_TEXT.away)}>Away</span>{game.awayTeam.name} Mechanics</h3>
          {hideSide === 'away' ? <HiddenTeamMechanics /> : <TeamMechanics team={game.awayTeam} playbook={game.playbook.away} />}
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-2"><span className={cn('mr-1', SIDE_TEXT.home)}>Home</span>{game.homeTeam.name} Mechanics</h3>
          {hideSide === 'home' ? <HiddenTeamMechanics /> : <TeamMechanics team={game.homeTeam} playbook={game.playbook.home} />}
        </div>
      </div>

      {/* pvp_series D3: the identity matchup bars compare both sides directly, which would
          leak the hidden side's identity through bar height alone — omitted under the gate. */}
      {!hideSide && (
      <div className="bg-surface-raised rounded-panel border border-line p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-4 text-center">Team Identity Matchup</h3>
        <div className="flex flex-col gap-2">
          {bars.map(b => (
            <div key={b.label} className="flex items-center gap-4">
              <div className="flex-1 flex justify-end">
                 <div className="h-2 bg-surface-sunken rounded-full border border-line-strong overflow-hidden w-full max-w-[150px]">
                   <div className="h-full float-right" style={{ width: `${Math.min(100, (b.a / 100) * 100)}%`, backgroundColor: b.color }}></div>
                 </div>
              </div>
              <div className="w-[85px] text-center text-xs font-bold uppercase tracking-widest text-ink-muted">{b.label}</div>
              <div className="flex-1 flex justify-start">
                 <div className="h-2 bg-surface-sunken rounded-full border border-line-strong overflow-hidden w-full max-w-[150px]">
                   <div className="h-full" style={{ width: `${Math.min(100, (b.h / 100) * 100)}%`, backgroundColor: b.color }}></div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
});

/**
 * D1: a completed game whose `balanceVersion` no longer matches the current engine
 * (`BALANCE_VERSION` in engine/balance.ts) can't be safely re-simulated from its seed —
 * the rules it was played under are gone. Shows the persisted box score with a notice
 * instead of a (potentially different) replayed game.
 */
export function BoxScoreOnly({ result, homeTeamName, awayTeamName }: {
  result: StoredGameResult;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return (
    <div className="flex flex-col h-full gap-3">
      <div className="bg-warn-soft border border-line rounded-panel p-4 text-center">
        <div className="text-sm font-bold text-warn">Play-by-play unavailable</div>
        <div className="text-xs text-warn mt-1">Game rules changed since this game was played — showing the final box score only.</div>
      </div>
      <div className="bg-surface-raised rounded-panel border border-line shadow-sm p-4 text-center">
        <div className="text-2xl font-black uppercase tracking-wider text-ink-strong" style={{ fontFamily: 'var(--font-bebas)' }}>
          Final: {awayTeamName} {result.finalScore[1]} @ {homeTeamName} {result.finalScore[0]}
        </div>
        <div className="text-xs text-ink-subtle mt-1">
          {(() => { const w = result.finalScore[0] > result.finalScore[1] ? homeTeamName : awayTeamName; return `${w} ${winsVerb(w)}`; })()}
          {result.isOvertime && ` (${result.overtimePeriods}OT)`}
        </div>
      </div>
      <div className="flex-1 bg-surface-raised rounded-panel border border-line shadow-sm overflow-y-auto p-3 min-h-0">
        <BoxScoreTable teamName={awayTeamName} side="away" box={result.boxScore.away} />
        <BoxScoreTable teamName={homeTeamName} side="home" box={result.boxScore.home} />
      </div>
    </div>
  );
}

// ── Play-by-play rows ─────────────────────────────────────────────────────────

type FeedRow =
  | { key: string; kind: 'poss'; event: PossessionEvent; text: string; clock: string }
  | { key: string; kind: 'beat'; beat: Beat; text: string };

/**
 * One derived clock string per possession from its ordinal inside its period (12:00
 * regulation, 5:00 OT). The crunch-time window (D10, last 4 possessions per team) lands
 * around 2:00 by this same formula, so the pop-up and the clock agree.
 */
function deriveClocks(events: PossessionEvent[]): string[] {
  const perQuarter = new Map<number, number>();
  for (const e of events) perQuarter.set(e.quarter, (perQuarter.get(e.quarter) ?? 0) + 1);
  const seen = new Map<number, number>();
  return events.map(e => {
    const k = (seen.get(e.quarter) ?? 0) + 1;
    seen.set(e.quarter, k);
    const total = perQuarter.get(e.quarter) ?? 1;
    const periodMin = e.quarter <= 4 ? 12 : 5;
    const secondsLeft = Math.max(0, Math.round(periodMin * 60 * (1 - k / total)));
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });
}

/** Memoized (D9): `beat` and `game` are stable references across ticks (beats are
 *  computed once for the whole theater); only rows the sliding window drops or adds
 *  should re-render, not the ~60 already on screen. */
const BeatRow = memo(function BeatRow({ beat, text, game }: { beat: Beat; text: string; game: GameTheater }) {
  const scoreLine = (score: [number, number]) => `${game.awayTeam.name} ${score[1]} · ${game.homeTeam.name} ${score[0]}`;
  switch (beat.type) {
    case 'run':
      return <div className="my-1 px-3 py-1.5 rounded-control bg-warn-soft text-warn text-xs font-black uppercase tracking-wide">{text}</div>;
    case 'game_winner':
      return <div className="my-1 px-3 py-1.5 rounded-control bg-accent text-accent-ink text-sm font-black uppercase tracking-wide">{text}</div>;
    case 'quarter_end': {
      const q = beat.quarter <= 4 ? `Q${beat.quarter}` : `OT${beat.quarter - 4}`;
      return (
        <Panel variant="sunken" padding="sm" className="my-2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-xs font-black uppercase tracking-widest text-ink-subtle">End of {q}</div>
            <div className="text-lg font-black text-ink-strong leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>{scoreLine(beat.score)}</div>
          </div>
          <div className="mt-1 text-xs text-ink-muted flex flex-wrap gap-x-4 gap-y-0.5">
            <span>{q}: {beat.quarterScore[1]}–{beat.quarterScore[0]}</span>
            {beat.topScorer && <span>Top scorer: <span className="font-bold text-ink-strong">{beat.topScorer.name}</span> ({beat.topScorer.points})</span>}
            <span className="font-mono">
              <span className={SIDE_TEXT.away}>{abbrev(game.awayTeam.name)}</span> {beat.shooting.away.fgm}-{beat.shooting.away.fga} FG, {beat.shooting.away.tpm}-{beat.shooting.away.tpa} 3P
              {' · '}
              <span className={SIDE_TEXT.home}>{abbrev(game.homeTeam.name)}</span> {beat.shooting.home.fgm}-{beat.shooting.home.fga} FG, {beat.shooting.home.tpm}-{beat.shooting.home.tpa} 3P
            </span>
          </div>
        </Panel>
      );
    }
    case 'clutch_start':
      return (
        <Panel variant="inverse" padding="sm" className="my-2 flex items-center justify-between gap-2">
          <span className="text-warn font-black uppercase tracking-widest text-sm" style={{ fontFamily: 'var(--font-bebas)' }}>Crunch time</span>
          <span className="text-xs text-ink-inverse-muted">{text}</span>
        </Panel>
      );
    case 'ot_start':
      return (
        <Panel variant="inverse" padding="sm" className="my-2 text-center">
          <span className="text-ink-inverse font-black uppercase tracking-widest text-sm" style={{ fontFamily: 'var(--font-bebas)' }}>{text}</span>
        </Panel>
      );
    case 'final':
      return (
        <Panel variant="raised" padding="sm" className="my-2 border-accent/40 text-center">
          <div className="text-xs font-black uppercase tracking-widest text-accent">Final</div>
          <div className="text-sm font-bold text-ink-strong">{text}</div>
        </Panel>
      );
    case 'identity':
      return <div className="px-3 py-0.5 text-xs italic text-ink-muted"><span className="text-positive not-italic mr-1">✦</span>{text}</div>;
    default:
      return <div className="px-3 py-0.5 text-xs italic text-ink-muted">{text}</div>;
  }
});

/** Memoized (D9): `event`/`text`/`clock` are all read from arrays sourced once per game
 *  (`game.possessions`, `texts`, `clocks`), so their identities are stable across ticks —
 *  passed as individual props (not the sliding-window `row` wrapper, which is rebuilt
 *  every tick) so a row already on screen actually skips re-render. */
const PossessionRow = memo(function PossessionRow({ event, text, clock, game, userSide, hideSide }: {
  event: PossessionEvent;
  text: string;
  clock: string;
  game: GameTheater;
  userSide: Side | null;
  /** pvp_series D3: the opponent's called plays are never listed, even in the feed. */
  hideSide?: Side;
}) {
  const isScoring = event.outcome === '2pt' || event.outcome === '3pt' || event.outcome === 'and1';
  const side: Side = event.team;
  const isUserRow = userSide === side;
  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1 px-2 rounded text-xs border-l-2',
        isUserRow ? (side === 'home' ? 'border-l-accent' : 'border-l-info') : 'border-l-transparent',
        isScoring ? (side === 'home' ? 'bg-accent-soft/40 font-bold text-ink-strong' : 'bg-info-soft font-bold text-ink-strong') : 'text-ink-muted',
        event.isClutch && 'ring-1 ring-warn/40',
      )}
    >
      <span className="shrink-0 font-mono text-ink-subtle w-14 whitespace-nowrap">{event.quarter <= 4 ? `Q${event.quarter}` : `OT${event.quarter - 4}`} {clock}</span>
      <span className={cn('shrink-0 text-xs font-black uppercase px-1 rounded w-10 text-center', SIDE_CHIP[side])}>{abbrev(side === 'home' ? game.homeTeam.name : game.awayTeam.name)}</span>
      <span className="flex-1 flex items-center flex-wrap gap-1.5">
        {hideSide !== side && event.calledPlays?.map((call, idx) => (
          <span
            key={idx}
            className={`shrink-0 text-xs font-bold uppercase tracking-wide px-1 py-0.5 rounded ${call.side === 'offense' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info'}`}
          >
            {call.side === 'offense' ? '▶' : '🛡'} {call.name}
          </span>
        ))}
        <span>{text}</span>
      </span>
      {isScoring && (
        <span className="shrink-0 font-mono text-xs text-ink-subtle">
          {event.runningScore[1]}-{event.runningScore[0]}
        </span>
      )}
    </div>
  );
});

/** `archetypes` is computed once per team by the parent (`useMemo` keyed on the team
 *  object, not on `score`) so a scoring play doesn't re-run archetype evaluation. */
const TeamBlock = memo(function TeamBlock({ game, side, score, isUser, seasonLine, archetypes, hideIdentity }: { game: GameTheater; side: Side; score: number; isUser: boolean; seasonLine: string; archetypes: ArchetypeStatus[]; hideIdentity?: boolean }) {
  const team = side === 'home' ? game.homeTeam : game.awayTeam;
  const isHome = side === 'home';
  useEffect(() => { bumpRenderCount('TeamBlock'); });
  return (
    <div className={cn('flex-1 flex flex-col justify-center min-w-0', isHome ? 'items-end text-right' : 'items-start text-left')}>
      <div className={cn('flex items-center gap-2 mb-1', isHome && 'flex-row-reverse')}>
        <div className={cn('w-9 h-9 rounded-control flex items-center justify-center font-black text-sm shrink-0', SIDE_CHIP[side])} style={{ fontFamily: 'var(--font-bebas)' }}>{abbrev(team.name)}</div>
        <div className="min-w-0">
          <div className={cn('flex items-center gap-1.5', isHome && 'flex-row-reverse')}>
            <div className="text-sm font-black uppercase tracking-widest text-ink-strong truncate">{team.name}</div>
            <span className={cn('text-xs font-black uppercase px-1.5 py-0.5 rounded', SIDE_CHIP[side])}>{side}</span>
            {isUser && team.name.trim().toLowerCase() !== 'you' && <span className="text-xs font-black uppercase px-1.5 py-0.5 rounded bg-surface-inverse text-ink-inverse">You</span>}
          </div>
          <div className="text-xs text-ink-muted font-mono">{seasonLine}</div>
        </div>
      </div>
      {/* pvp_series D3: the opponent's archetype chips are identity, never listed. */}
      {!hideIdentity && (
        <div className={cn('flex items-center gap-1 flex-wrap mb-1', isHome && 'justify-end')}>
          {archetypes.map(s => (
            <span key={s.def.id} className={cn('text-xs font-bold uppercase tracking-wide px-1 py-0.5 rounded', TIER_CLASS[s.tier])} title={TIER_LABEL[s.tier]}>✦ {s.def.name}</span>
          ))}
        </div>
      )}
      <div className={cn('text-5xl font-black leading-none', isUser ? 'text-ink-strong' : 'text-ink')} style={{ fontFamily: 'var(--font-bebas)' }}>{score}</div>
      <div className="mt-3 hidden sm:block"><TeamStarters team={team} isHome={isHome} /></div>
    </div>
  );
});

// ── GameView ──────────────────────────────────────────────────────────────────

export function GameView({ game, onCompletionChange, context, initialState, hideOpponentDetails }: GameViewProps) {
  const [currentPoss, setCurrentPoss] = useState(initialState?.possession ?? -1); // -1 = not started
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'playByPlay' | 'boxScore' | 'matchup'>(initialState?.tab ?? 'matchup');
  const [autoScroll, setAutoScroll] = useState(true);
  const [crunchPopup, setCrunchPopup] = useState(initialState?.crunchPopup ? 1 : 0); // >0 while the pop-up is visible
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shownCrunchRef = useRef<Set<number>>(new Set());

  // T11 test hook: exposes the possession counter alongside the render counts above so
  // the spec can correlate "ticks elapsed" with "TeamBlock renders" from one object.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return;
    window.__gameViewRenderCounts = window.__gameViewRenderCounts ?? {};
    window.__gameViewRenderCounts.__currentPoss = currentPoss;
  }, [currentPoss]);

  const totalPoss = game.possessions.length;
  const isComplete = currentPoss >= totalPoss - 1;
  const currentEvent = currentPoss >= 0 ? game.possessions[currentPoss] : null;
  const score = currentEvent ? currentEvent.runningScore : [0, 0];
  const quarter = currentEvent?.quarter || 1;

  const userSeatId = context?.userSeatId ?? DEFAULT_USER_SEAT;
  const userSide: Side | null = game.homeTeam.seatId === userSeatId ? 'home' : game.awayTeam.seatId === userSeatId ? 'away' : null;

  // D9: computed once per team, not once per tick — `TeamBlock` re-renders on every
  // scoring play (its score prop), but a team's archetype selection never changes
  // mid-game, so it must not be recomputed along with the score.
  const homeArchetypes = useMemo(() => teamArchetypeStatuses(game.homeTeam), [game.homeTeam]);
  const awayArchetypes = useMemo(() => teamArchetypeStatuses(game.awayTeam), [game.awayTeam]);

  // Narration (D2), beats (D4) and clocks are pure functions of the theater: computed once.
  const texts = useMemo(() => renderTheater(game), [game]);
  const beats = useMemo(() => computeBeats(game), [game]);
  const clocks = useMemo(() => deriveClocks(game.possessions), [game.possessions]);
  const beatsByIndex = useMemo(() => {
    const m = new Map<number, Beat[]>();
    for (const b of beats) { const arr = m.get(b.atIndex) ?? []; arr.push(b); m.set(b.atIndex, arr); }
    return m;
  }, [beats]);
  /** Indices of the first clutch possession per period (D10): speed snaps to 1x here. */
  const crunchStarts = useMemo(() => new Set(beats.filter(b => b.type === 'clutch_start').map(b => b.atIndex + 1)), [beats]);
  // D9: replaying the box score from possession 0 is only needed while the box-score tab
  // is actually visible (and the game isn't over — the final tab reads `game.boxScore`
  // directly instead, see below) — every other tick, on every other tab, skip it.
  const showLiveBox = activeTab === 'boxScore' && !isComplete;
  const liveBox = useMemo(
    () => (showLiveBox ? boxScoreThrough(game, currentPoss) : EMPTY_BOX),
    [game, currentPoss, showLiveBox]
  );
  const summary = useMemo(() => {
    if (!isComplete || game.boxScore.home.length === 0 || game.boxScore.away.length === 0) return null;
    return summarizeGame(game, userSeatId);
  }, [game, isComplete, userSeatId]);

  const speedMs = SPEEDS[speedIdx].ms;

  const stepTo = useCallback((next: number) => {
    if (crunchStarts.has(next) && !shownCrunchRef.current.has(next)) {
      shownCrunchRef.current.add(next);
      setSpeedIdx(0);
      setCrunchPopup(next + 1);
    }
    setCurrentPoss(next);
  }, [crunchStarts]);

  // Auto-play timer
  useEffect(() => {
    if (isPlaying && !isComplete) {
      timerRef.current = setInterval(() => {
        setCurrentPoss(prev => {
          const next = prev + 1;
          if (next >= totalPoss) { setIsPlaying(false); return totalPoss - 1; }
          if (crunchStarts.has(next) && !shownCrunchRef.current.has(next)) {
            shownCrunchRef.current.add(next);
            setSpeedIdx(0);
            setCrunchPopup(next + 1);
          }
          return next;
        });
      }, speedMs);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, speedMs, isComplete, totalPoss, crunchStarts]);

  // Crunch-time pop-up auto-vanishes (D10).
  useEffect(() => {
    if (!crunchPopup) return;
    const t = setTimeout(() => setCrunchPopup(0), CRUNCH_POPUP_MS);
    return () => clearTimeout(t);
  }, [crunchPopup]);

  // Auto-scroll that stops when the user scrolls up (D6).
  useEffect(() => {
    if (autoScroll && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [currentPoss, autoScroll, activeTab]);
  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setAutoScroll(atBottom);
  };

  useEffect(() => {
    onCompletionChange?.(isComplete);
  }, [isComplete, onCompletionChange]);

  const handleStart = () => { stepTo(0); setIsPlaying(true); setActiveTab('playByPlay'); };
  const handleTogglePlay = () => setIsPlaying(prev => !prev);
  /** D6: "End" is not a speed — it shows the result now (no beats, no pop-up). */
  const handleEnd = () => { setCurrentPoss(totalPoss - 1); setIsPlaying(false); setCrunchPopup(0); setActiveTab('boxScore'); };

  const quarterLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;
  const timeDisplay = currentPoss >= 0 ? clocks[currentPoss] : '12:00';
  const inClutch = !!currentEvent?.isClutch && !isComplete;

  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];
    const from = Math.max(0, currentPoss - 60);
    for (let i = from; i <= currentPoss && i < totalPoss; i++) {
      const e = game.possessions[i];
      out.push({ key: `p${i}`, kind: 'poss', event: e, text: texts[i] ?? e.narrativeText, clock: clocks[i] });
      // card_balance narration fix (2026-09-17): keyed by type alone, home and away
      // identity beats at the same quarter share one atIndex — same key, so React's
      // keyed reconciliation of this sliding window could strand duplicate DOM nodes
      // as it scrolled (worse at higher playback speed, more re-renders per second).
      // Include the position within this index's beat list so every key is unique.
      (beatsByIndex.get(i) ?? []).forEach((b, bi) => {
        out.push({ key: `b${i}-${bi}-${b.type}`, kind: 'beat', beat: b, text: renderBeat(b, game) });
      });
    }
    return out;
  }, [game, currentPoss, totalPoss, texts, clocks, beatsByIndex]);

  const latestBeat = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; if (r.kind === 'beat' && r.beat.type !== 'final') return r.text; }
    return null;
  }, [rows]);

  const tabButtonClass = (active: boolean) => cn(active && 'bg-surface-inverse text-ink-inverse border-surface-inverse hover:bg-surface-inverse');

  const seasonLine = (side: Side) => {
    const line = side === 'home' ? context?.home : context?.away;
    if (!line) return 'Exhibition';
    return `${line.wins}-${line.losses} · ${line.streak} · ${ordinal(line.rank)} of ${line.of}`;
  };
  const h2h = context?.headToHead && context.headToHead[0] + context.headToHead[1] > 0 ? context.headToHead : null;

  return (
    <div className="flex flex-col h-full gap-3 relative">
      {/* Scoreboard */}
      <div className="bg-surface-raised rounded-panel border border-line shadow-sm overflow-hidden">
        <div className="flex items-stretch justify-between p-4 border-b border-line bg-surface-sunken gap-2">
          <TeamBlock game={game} side="away" score={score[1]} isUser={userSide === 'away'} seasonLine={seasonLine('away')} archetypes={awayArchetypes} hideIdentity={hideOpponentDetails === 'away'} />

          {/* Center: status, clock, ticker */}
          <div className="flex flex-col items-center justify-center px-2 sm:px-6 min-w-[110px] sm:min-w-[160px] text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-1">
              {currentPoss < 0 ? 'Pre-game' : isComplete ? 'Final' : quarterLabel}
            </div>
            {!isComplete && currentPoss >= 0 && (
              <div className="text-2xl font-bold text-ink-strong leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>{timeDisplay}</div>
            )}
            {inClutch && (
              <div className="mt-1 text-xs font-black uppercase tracking-widest text-warn bg-warn-soft px-2 py-0.5 rounded motion-safe:animate-pulse">Crunch time</div>
            )}
            {isComplete && game.isOvertime && (
              <div className="text-xs font-bold text-warn uppercase mt-1">{game.overtimePeriods}× Overtime</div>
            )}
            {currentPoss < 0 && (
              <>
                <div className="text-3xl font-black text-ink-subtle italic my-1" style={{ fontFamily: 'var(--font-bebas)' }}>@</div>
                {h2h && <div className="text-xs text-ink-muted font-mono">Season series {h2h[1]}-{h2h[0]}</div>}
              </>
            )}
            {currentPoss >= 0 && latestBeat && (
              <div className="mt-2 text-xs italic text-ink-muted max-w-[220px] truncate" title={latestBeat}>{latestBeat}</div>
            )}
          </div>

          <TeamBlock game={game} side="home" score={score[0]} isUser={userSide === 'home'} seasonLine={seasonLine('home')} archetypes={homeArchetypes} hideIdentity={hideOpponentDetails === 'home'} />
        </div>

        {/* Quarter scores bar */}
        {game.quarterSummaries.length > 0 && currentPoss >= 0 && (
          <div className="flex text-xs font-bold text-ink-muted border-t border-line bg-surface-raised">
            <div className="flex-1 flex items-center px-3 gap-2 text-xs font-mono">
              <span className={SIDE_TEXT.away}>{abbrev(game.awayTeam.name)}</span>
              <span className="text-ink-subtle">@</span>
              <span className={SIDE_TEXT.home}>{abbrev(game.homeTeam.name)}</span>
            </div>
            {/* A quarter's row only appears once its possessions are fully consumed —
                quarterSummaries holds every quarter's precomputed final score up front
                (the theater is fully simulated ahead of playback), so including the
                in-progress quarter here (q.quarter <= quarter) would spoil its own
                ending before the last possession plays. */}
            {game.quarterSummaries.filter(q => q.quarter < quarter || (isComplete && q.quarter === quarter)).map(q => (
              <div key={q.quarter} className="w-10 text-center py-1 flex flex-col border-l border-line">
                <span className="text-xs text-ink-subtle border-b border-line">{q.quarter <= 4 ? `Q${q.quarter}` : `OT`}</span>
                <span className={cn('py-0.5', SIDE_TEXT.away)}>{q.awayScore}</span>
                <span className={cn('border-t border-line py-0.5', SIDE_TEXT.home)}>{q.homeScore}</span>
              </div>
            ))}
            {!isComplete && (
              <div className="w-10 text-center py-1 flex flex-col border-l border-line">
                <span className="text-xs text-ink-subtle border-b border-line">{quarterLabel}</span>
                <span className={cn('py-0.5', SIDE_TEXT.away)}>{score[1] - game.quarterSummaries.filter(q => q.quarter < quarter).reduce((s, q) => s + q.awayScore, 0)}</span>
                <span className={cn('border-t border-line py-0.5', SIDE_TEXT.home)}>{score[0] - game.quarterSummaries.filter(q => q.quarter < quarter).reduce((s, q) => s + q.homeScore, 0)}</span>
              </div>
            )}
            <div className="w-12 text-center py-1 flex flex-col border-l border-line-strong font-black">
              <span className="text-xs text-ink-subtle border-b border-line">T</span>
              <span className={cn('py-0.5', SIDE_TEXT.away)}>{score[1]}</span>
              <span className={cn('border-t border-line py-0.5', SIDE_TEXT.home)}>{score[0]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {currentPoss < 0 ? (
          <>
            <Button onClick={handleStart} variant="primary" icon={<PlayIcon className="w-4 h-4" />}>
              Tip Off
            </Button>
            <Button onClick={() => setActiveTab('matchup')} variant="secondary" className={tabButtonClass(activeTab === 'matchup')}>
              Matchup Preview
            </Button>
          </>
        ) : (
          <>
            {!isComplete && (
              <>
                <Button onClick={handleTogglePlay} variant="secondary" icon={isPlaying ? <Pause className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}>
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
                <div className="inline-flex rounded-control border border-line-strong overflow-hidden" role="group" aria-label="Playback speed">
                  {SPEEDS.map((s, i) => (
                    <Button
                      key={s.label}
                      variant="ghost"
                      onClick={() => setSpeedIdx(i)}
                      aria-pressed={speedIdx === i}
                      className={cn('min-w-control rounded-none px-3', speedIdx === i && 'bg-surface-inverse text-ink-inverse hover:bg-surface-inverse hover:text-ink-inverse')}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                <Button onClick={handleEnd} variant="secondary" icon={<SkipForward className="w-4 h-4" />} title="Show the result now">
                  End
                </Button>
                <div className="w-px h-6 bg-line mx-1"></div>
              </>
            )}
            <Button onClick={() => setActiveTab('matchup')} variant="secondary" className={tabButtonClass(activeTab === 'matchup')}>
              Matchup
            </Button>
            <Button onClick={() => setActiveTab('playByPlay')} variant="secondary" className={tabButtonClass(activeTab === 'playByPlay')}>
              Play-by-Play
            </Button>
            <Button onClick={() => setActiveTab('boxScore')} variant="secondary" className={tabButtonClass(activeTab === 'boxScore')}>
              {isComplete ? 'Box Score & Summary' : 'Box Score'}
            </Button>
          </>
        )}
      </div>

      <div className="flex-1 bg-surface-raised rounded-panel border border-line shadow-sm overflow-hidden min-h-0 flex flex-col relative">
        {activeTab === 'matchup' && <TaleOfTheTape game={game} hideSide={hideOpponentDetails} />}

        {/* Play-by-Play Feed */}
        {activeTab === 'playByPlay' && currentPoss >= 0 && (
          <>
            <div ref={feedRef} onScroll={handleFeedScroll} className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-0.5">
                {rows.map(row => row.kind === 'beat'
                  ? <BeatRow key={row.key} beat={row.beat} text={row.text} game={game} />
                  : <PossessionRow key={row.key} event={row.event} text={row.text} clock={row.clock} game={game} userSide={userSide} hideSide={hideOpponentDetails} />
                )}
              </div>
            </div>
            {!autoScroll && !isComplete && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <Button variant="inverse" className="bg-surface-inverse shadow-lg" icon={<ArrowDown className="w-4 h-4" />} onClick={() => { setAutoScroll(true); if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }}>
                  Jump to live
                </Button>
              </div>
            )}
          </>
        )}

        {/* Box Score (+ Summary once complete) */}
        {activeTab === 'boxScore' && (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-2">
              {isComplete ? 'Final box score' : currentPoss < 0 ? 'Pre-game' : `Through ${quarterLabel} ${timeDisplay} · live`}
            </div>
            {summary && <GameSummaryPanel summary={summary} homeName={game.homeTeam.name} awayName={game.awayTeam.name} />}
            {(['away', 'home'] as Side[]).map(side => {
              const team = side === 'home' ? game.homeTeam : game.awayTeam;
              // Never reveal the precomputed final numbers mid-game: derive from what has been played.
              const box = isComplete
                ? (side === 'home' ? game.boxScore.home : game.boxScore.away)
                : (side === 'home' ? liveBox.home : liveBox.away);
              return (
                <BoxScoreTable key={side} teamName={team.name} side={side} box={box} starters={team.starters} isUser={userSide === side} live={!isComplete} hideDnp={hideOpponentDetails === side} />
              );
            })}
          </div>
        )}

        {/* D10: "Crunchtime!" pop-up — appears once per window entry, fades on its own. */}
        {crunchPopup > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20" aria-live="polite">
            <div className="crunch-pop rounded-panel bg-surface-inverse text-warn px-8 py-4 shadow-xl border border-warn/40">
              <div className="text-5xl font-black uppercase tracking-widest leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>Crunchtime!</div>
            </div>
          </div>
        )}
      </div>

      {/* Final Result Banner */}
      {isComplete && currentPoss >= 0 && (
        <div className="bg-surface-raised rounded-panel border border-line shadow-sm p-4 text-center">
          <div className="text-2xl font-black uppercase tracking-wider text-ink-strong" style={{ fontFamily: 'var(--font-bebas)' }}>
            Final: <span className={SIDE_TEXT.away}>{game.awayTeam.name} {game.finalScore[1]}</span> @ <span className={SIDE_TEXT.home}>{game.homeTeam.name} {game.finalScore[0]}</span>
          </div>
          <div className="text-xs text-ink-subtle mt-1">
            {(() => { const w = game.finalScore[0] > game.finalScore[1] ? game.homeTeam.name : game.awayTeam.name; return `${w} ${winsVerb(w)}`; })()}
            {game.isOvertime && ` (${game.overtimePeriods}OT)`}
            {summary && <> · Player of the game: <span className="font-bold text-ink-strong">{summary.playerOfTheGame.name}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}
