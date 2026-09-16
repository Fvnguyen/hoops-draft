'use client';

import { useMemo, useState } from 'react';
import type { PlayerBoxScore } from '../engine/game';
import type { GameSummary, GameScoreLine, Side } from '../narration/types';
import { Button, Panel } from './ui';
import { cn } from '@/lib/cn';

/**
 * game_theater D11(c)/(d): the box score table (sortable, starters above a divider, top
 * value per column highlighted, DNP rows collapsed, percentages derived) and the
 * post-game Summary (player of the game, the user team's top/low performer, roster
 * hints). Tolerates rows saved before D9 (missing fields read as 0) so legacy seasons
 * still render.
 */

export const SIDE_CHIP: Record<Side, string> = {
  home: 'bg-accent-soft text-accent',
  away: 'bg-info-soft text-info',
};
export const SIDE_TEXT: Record<Side, string> = { home: 'text-accent', away: 'text-info' };

type Col = 'minutes' | 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'fg' | 'tp' | 'ft' | 'plusMinus';

const COLS: { key: Col; label: string; title: string }[] = [
  { key: 'minutes', label: 'MIN', title: 'Minutes' },
  { key: 'points', label: 'PTS', title: 'Points' },
  { key: 'rebounds', label: 'REB', title: 'Rebounds (offensive + defensive)' },
  { key: 'assists', label: 'AST', title: 'Assists' },
  { key: 'steals', label: 'STL', title: 'Steals' },
  { key: 'blocks', label: 'BLK', title: 'Blocks' },
  { key: 'turnovers', label: 'TOV', title: 'Turnovers' },
  { key: 'fg', label: 'FG', title: 'Field goals made-attempted' },
  { key: 'tp', label: '3P', title: 'Three-pointers made-attempted' },
  { key: 'ft', label: 'FT', title: 'Free throws made-attempted' },
  { key: 'plusMinus', label: '+/-', title: 'Plus/minus while on the floor' },
];

const n = (v: number | undefined) => v ?? 0;
export const rebounds = (b: PlayerBoxScore) => n(b.offensiveRebounds) + n(b.defensiveRebounds);

function sortValue(b: PlayerBoxScore, col: Col): number {
  switch (col) {
    case 'minutes': return n(b.minutes);
    case 'points': return n(b.points);
    case 'rebounds': return rebounds(b);
    case 'assists': return n(b.assists);
    case 'steals': return n(b.steals);
    case 'blocks': return n(b.blocks);
    case 'turnovers': return n(b.turnovers);
    case 'fg': return n(b.fieldGoalsMade) * 1000 + n(b.fieldGoalsAttempted);
    case 'tp': return n(b.threesMade) * 1000 + n(b.threesAttempted);
    case 'ft': return n(b.freeThrowsMade) * 1000 + n(b.freeThrowsAttempted);
    case 'plusMinus': return n(b.plusMinus);
  }
}

function cell(b: PlayerBoxScore, col: Col): string {
  switch (col) {
    case 'minutes': return n(b.minutes).toFixed(0);
    case 'points': return String(n(b.points));
    case 'rebounds': return String(rebounds(b));
    case 'assists': return String(n(b.assists));
    case 'steals': return String(n(b.steals));
    case 'blocks': return String(n(b.blocks));
    case 'turnovers': return String(n(b.turnovers));
    case 'fg': return `${n(b.fieldGoalsMade)}-${n(b.fieldGoalsAttempted)}`;
    case 'tp': return `${n(b.threesMade)}-${n(b.threesAttempted)}`;
    case 'ft': return `${n(b.freeThrowsMade)}-${n(b.freeThrowsAttempted)}`;
    case 'plusMinus': { const pm = n(b.plusMinus); return pm > 0 ? `+${pm}` : String(pm); }
  }
}

function pct(made: number, att: number): string {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : '—';
}

export function BoxScoreTable({ teamName, side, box, starters, isUser, live }: {
  teamName: string;
  side: Side;
  box: PlayerBoxScore[];
  starters?: string[];
  isUser?: boolean;
  /** Live (mid-game) tables hide the DNP toggle: nobody has "not played" yet. */
  live?: boolean;
}) {
  const [sort, setSort] = useState<Col>('points');
  const [showDnp, setShowDnp] = useState(false);
  const starterSet = useMemo(() => new Set(starters ?? []), [starters]);

  const played = box.filter(b => n(b.possessions) > 0);
  const dnp = box.filter(b => n(b.possessions) === 0);
  const bySort = (a: PlayerBoxScore, b: PlayerBoxScore) => sortValue(b, sort) - sortValue(a, sort) || n(b.points) - n(a.points);
  const starterRows = played.filter(b => starterSet.has(b.playerId)).sort(bySort);
  const benchRows = played.filter(b => !starterSet.has(b.playerId)).sort(bySort);
  const rows = starters?.length ? [...starterRows, ...benchRows] : played.sort(bySort);

  // Top value per column (ties all highlighted); a column with all zeros highlights nothing.
  const tops = new Map<Col, number>();
  for (const c of COLS) {
    const best = Math.max(0, ...played.map(b => sortValue(b, c.key)));
    if (best > 0) tops.set(c.key, best);
  }

  const totals = played.reduce((t, b) => ({
    fgm: t.fgm + n(b.fieldGoalsMade), fga: t.fga + n(b.fieldGoalsAttempted),
    tpm: t.tpm + n(b.threesMade), tpa: t.tpa + n(b.threesAttempted),
    ftm: t.ftm + n(b.freeThrowsMade), fta: t.fta + n(b.freeThrowsAttempted),
    pts: t.pts + n(b.points), reb: t.reb + rebounds(b), ast: t.ast + n(b.assists), tov: t.tov + n(b.turnovers),
  }), { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pts: 0, reb: 0, ast: 0, tov: 0 });

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('text-xs font-black uppercase tracking-wide px-1.5 py-0.5 rounded', SIDE_CHIP[side])}>{side}</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-ink-strong">{teamName}</h3>
        {isUser && teamName.trim().toLowerCase() !== 'you' && <span className="text-xs font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-inverse text-ink-inverse">You</span>}
        <span className="ml-auto text-xs text-ink-subtle font-mono">
          FG {pct(totals.fgm, totals.fga)} · 3P {pct(totals.tpm, totals.tpa)} · FT {pct(totals.ftm, totals.fta)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-ink-subtle font-bold uppercase border-b border-line">
              <th className="text-left py-1 pr-2">Player</th>
              {COLS.map(c => (
                <th key={c.key} className="text-center py-1 px-1">
                  <Button
                    variant="ghost"
                    title={`Sort by ${c.title}`}
                    onClick={() => setSort(c.key)}
                    className={cn('px-1 text-xs tracking-wide', sort === c.key ? 'text-ink-strong underline decoration-accent decoration-2 underline-offset-4' : 'text-ink-subtle')}
                  >
                    {c.label}
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, idx) => {
              const isStarter = starterSet.has(b.playerId);
              const dividerBefore = starters?.length && idx === starterRows.length && benchRows.length > 0;
              return (
                <tr key={b.playerId} className={cn('border-b border-line text-ink-muted', dividerBefore && 'border-t-2 border-t-line-strong', isUser && 'bg-accent-soft/20')}>
                  <td className="text-left py-1 pr-2 font-bold text-ink-strong whitespace-nowrap">
                    {b.playerName}
                    {isStarter && <span className="ml-1 text-ink-subtle font-normal" title="Starter">•</span>}
                  </td>
                  {COLS.map(c => {
                    const v = sortValue(b, c.key);
                    const top = tops.get(c.key) !== undefined && v === tops.get(c.key);
                    const pm = c.key === 'plusMinus' ? n(b.plusMinus) : 0;
                    return (
                      <td key={c.key} className={cn('text-center py-1 px-1', top && 'font-black text-ink-strong', c.key === 'plusMinus' && pm > 0 && 'text-positive', c.key === 'plusMinus' && pm < 0 && 'text-danger')}>
                        {cell(b, c.key)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="text-ink-subtle font-bold">
              <td className="py-1 pr-2 uppercase tracking-wide">Team</td>
              <td className="text-center py-1 px-1">—</td>
              <td className="text-center py-1 px-1 text-ink-strong">{totals.pts}</td>
              <td className="text-center py-1 px-1">{totals.reb}</td>
              <td className="text-center py-1 px-1">{totals.ast}</td>
              <td className="text-center py-1 px-1">{played.reduce((s, b) => s + n(b.steals), 0)}</td>
              <td className="text-center py-1 px-1">{played.reduce((s, b) => s + n(b.blocks), 0)}</td>
              <td className="text-center py-1 px-1">{totals.tov}</td>
              <td className="text-center py-1 px-1">{totals.fgm}-{totals.fga}</td>
              <td className="text-center py-1 px-1">{totals.tpm}-{totals.tpa}</td>
              <td className="text-center py-1 px-1">{totals.ftm}-{totals.fta}</td>
              <td className="text-center py-1 px-1">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!live && dnp.length > 0 && (
        <div className="mt-1">
          <Button variant="ghost" onClick={() => setShowDnp(s => !s)} className="px-2 text-xs tracking-wide">
            {showDnp ? 'Hide' : 'Show'} {dnp.length} DNP
          </Button>
          {showDnp && <div className="text-xs text-ink-subtle px-2 pb-1">{dnp.map(b => b.playerName).join(' · ')}</div>}
        </div>
      )}
    </div>
  );
}

function StatLine({ line }: { line: GameScoreLine }) {
  const b = line.box;
  return (
    <span className="font-mono text-xs text-ink-muted">
      {n(b.points)} pts · {rebounds(b)} reb · {n(b.assists)} ast · {n(b.fieldGoalsMade)}-{n(b.fieldGoalsAttempted)} fg
      {n(b.steals) + n(b.blocks) > 0 && ` · ${n(b.steals)} stl · ${n(b.blocks)} blk`}
    </span>
  );
}

export function GameSummaryPanel({ summary, homeName, awayName }: { summary: GameSummary; homeName: string; awayName: string }) {
  const potg = summary.playerOfTheGame;
  const user = summary.userTeam;
  const teamName = (s: Side) => (s === 'home' ? homeName : awayName);
  return (
    <Panel variant="sunken" padding="md" className="mb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-3">Summary</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel variant="raised" padding="sm" className="border-accent/40">
          <div className="text-xs font-black uppercase tracking-widest text-accent">Player of the game</div>
          <div className="text-xl font-black text-ink-strong leading-tight" style={{ fontFamily: 'var(--font-bebas)' }}>{potg.name}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-black uppercase tracking-wide px-1.5 py-0.5 rounded', SIDE_CHIP[potg.side])}>{teamName(potg.side)}</span>
            <StatLine line={potg} />
          </div>
        </Panel>
        {user && (
          <Panel variant="raised" padding="sm">
            <div className="text-xs font-black uppercase tracking-widest text-ink-subtle">Your team</div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase text-positive">Top</span>
              <span className="font-bold text-ink-strong">{user.top.name}</span>
              <StatLine line={user.top} />
            </div>
            {user.low && user.low.playerId !== user.top.playerId && (
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase text-danger">Low</span>
                <span className="font-bold text-ink-strong">{user.low.name}</span>
                <StatLine line={user.low} />
              </div>
            )}
          </Panel>
        )}
      </div>
      {user && user.hints.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-black uppercase tracking-widest text-ink-subtle mb-1">Roster notes</div>
          <ul className="space-y-1">
            {user.hints.map(h => (
              <li key={h.ruleId + h.playerId} className="text-sm text-ink flex gap-2">
                <span className="text-accent shrink-0">◆</span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
