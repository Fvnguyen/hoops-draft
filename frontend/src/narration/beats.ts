/**
 * Game-flow beats (plan D4, D5, D10). `computeBeats(theater)` derives runs, lead
 * changes, ties, largest leads, quarter summaries, crunch-time and OT markers, identity
 * flavour, the game winner and the final line from the possession events alone — beats
 * are never stored. Pure: no React, no engine simulation entry points, no Math.random.
 *
 * Conventions: `runningScore` is [home, away] AFTER the possession; a beat with
 * atIndex i is shown after possession i. Quarter numbers > 4 are overtime periods
 * (period = quarter - 4).
 */
import type { Beat, ComputeBeats, GameTheater, PossessionEvent, Side } from './types';
import type { TeamInfo } from '../engine/game';
import { evaluateArchetypes, type ArchetypeStatus } from '../engine/archetypes';
import { identityLine, type IdentityStats } from './templates/identity';

export const RUN_MIN_POINTS = 8;
export const LARGEST_LEAD_MIN = 10;
export const GAME_WINNER_MAX_MARGIN = 3;

type Score = [number, number];

const sideIndex = (side: Side): 0 | 1 => (side === 'home' ? 0 : 1);
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const marginOf = (s: Score): number => s[0] - s[1];

/** Points scored on this possession, from the running-score delta (never negative). */
function pointsOf(prev: Score, ev: PossessionEvent): number {
  return Math.max(0, ev.runningScore[0] - prev[0]) + Math.max(0, ev.runningScore[1] - prev[1]);
}

/** Which side the running score moved for (usually `ev.team`; falls back to the delta). */
function scoringSideOf(prev: Score, ev: PossessionEvent): Side | null {
  if (ev.runningScore[0] > prev[0]) return 'home';
  if (ev.runningScore[1] > prev[1]) return 'away';
  return null;
}

/** Display order for beats that share an atIndex. */
const PRIORITY: Record<Beat['type'], number> = {
  run: 0, run_answered: 0, lead_change: 1, tie: 1, largest_lead: 2,
  game_winner: 3, identity: 4, clutch_start: 5, quarter_end: 6, ot_start: 7, final: 8,
};

// ── Identity (D5) ───────────────────────────────────────────────────────────

/** Mirrors `teamArchetypeStatuses` in components/GameView.tsx: the selected plan(s). */
export function selectedIdentities(team: TeamInfo): ArchetypeStatus[] {
  const selection = team.archetypes;
  if (!selection) return [];
  const statuses = evaluateArchetypes(team.players, new Set(team.starters));
  const byId = new Map(statuses.map(s => [s.def.id, s]));
  const selected: ArchetypeStatus[] = [];
  if (selection.gold) {
    const s = byId.get(selection.gold);
    if (s) selected.push(s);
  } else {
    if (selection.offense) { const s = byId.get(selection.offense); if (s) selected.push(s); }
    if (selection.defense) { const s = byId.get(selection.defense); if (s) selected.push(s); }
  }
  return selected.filter(s => s.tier === 'online' || s.tier === 'dedicated');
}

function emptyIdentityStats(): IdentityStats {
  return {
    tpm: 0, tpa: 0, midm: 0, mida: 0, rimm: 0, rima: 0, paint: 0, oreb: 0, ast: 0, poss: 0, pts: 0,
    opptpm: 0, opptpa: 0, opprimm: 0, opprima: 0, forced: 0, opppts: 0,
  };
}

/** Quarter-so-far stats for `side` over `events` (all from one period, in order). */
export function identityStats(events: PossessionEvent[], side: Side, scoreBefore: Score): IdentityStats {
  const s = emptyIdentityStats();
  let prev: Score = scoreBefore;
  for (const ev of events) {
    const pts = pointsOf(prev, ev);
    const own = ev.team === side;
    if (own) {
      s.poss += 1;
      s.pts += pts;
      if (ev.assistPlayerId && pts > 0) s.ast += 1;
      s.oreb += ev.offensiveRebounders?.length ?? 0;
      let lastMade: string | null = null;
      for (const sh of ev.shots ?? []) {
        if (sh.channel === 'three') { s.tpa += 1; if (sh.made) s.tpm += 1; }
        else if (sh.channel === 'mid') { s.mida += 1; if (sh.made) s.midm += 1; }
        else { s.rima += 1; if (sh.made) s.rimm += 1; }
        if (sh.made) lastMade = sh.channel;
      }
      if (lastMade === 'rim') s.paint += pts;
    } else {
      s.opppts += pts;
      if (ev.turnoverPlayerId || ev.narrative?.kind === 'turnover' || ev.narrative?.kind === 'steal') s.forced += 1;
      for (const sh of ev.shots ?? []) {
        if (sh.channel === 'three') { s.opptpa += 1; if (sh.made) s.opptpm += 1; }
        else if (sh.channel === 'rim') { s.opprima += 1; if (sh.made) s.opprimm += 1; }
      }
    }
    prev = ev.runningScore;
  }
  return s;
}

function periodLabel(quarter: number, overtimePeriods: number): string {
  if (quarter <= 4) return `Q${quarter}`;
  return overtimePeriods > 1 ? `OT${quarter - 4}` : 'OT';
}

// ── computeBeats ────────────────────────────────────────────────────────────

export const computeBeats: ComputeBeats = (theater: GameTheater): Beat[] => {
  const events = theater.possessions;
  const beats: Beat[] = [];
  if (events.length === 0) return beats;

  const nameOf = (id: string | undefined, side: Side): string => {
    if (!id) return '';
    const team = side === 'home' ? theater.homeTeam : theater.awayTeam;
    return team.players.find(p => p.id === id)?.player.name
      ?? theater.boxScore[side].find(b => b.playerId === id)?.playerName
      ?? id;
  };

  // ── Pass 1: per-possession beats (runs, lead changes, ties, largest lead) ──
  let prev: Score = [0, 0];
  let runSide: Side | null = null;
  let runPoints = 0;
  let runEmitted = false;
  let lastLeader: Side | null = null;
  let maxMargin = 0;
  const largestLeadEmitted = new Set<string>(); // `${quarter}:${side}`

  for (const ev of events) {
    const pts = pointsOf(prev, ev);
    const scorer = scoringSideOf(prev, ev);
    const score: Score = [ev.runningScore[0], ev.runningScore[1]];

    if (scorer && pts > 0) {
      // Runs: unanswered points by one side.
      if (runSide === scorer) {
        runPoints += pts;
      } else {
        if (runSide && runEmitted) {
          beats.push({ type: 'run_answered', atIndex: ev.index, side: scorer, runPoints, score });
        }
        runSide = scorer;
        runPoints = pts;
        runEmitted = false;
      }
      if (!runEmitted && runPoints >= RUN_MIN_POINTS) {
        beats.push({ type: 'run', atIndex: ev.index, side: scorer, points: runPoints, opponentPoints: 0, score });
        runEmitted = true;
      }

      // Lead changes and ties (compare against the last non-tie leader).
      const m = marginOf(score);
      const prevM = marginOf(prev);
      if (m === 0) {
        if (prevM !== 0) beats.push({ type: 'tie', atIndex: ev.index, score });
      } else {
        const leader: Side = m > 0 ? 'home' : 'away';
        if (lastLeader !== null && leader !== lastLeader) {
          beats.push({ type: 'lead_change', atIndex: ev.index, side: leader, score });
        }
        lastLeader = leader;

        // Largest lead: new game high, >= LARGEST_LEAD_MIN, once per side per quarter.
        const abs = Math.abs(m);
        if (abs > maxMargin) {
          maxMargin = abs;
          const key = `${ev.quarter}:${leader}`;
          if (abs >= LARGEST_LEAD_MIN && !largestLeadEmitted.has(key)) {
            largestLeadEmitted.add(key);
            beats.push({ type: 'largest_lead', atIndex: ev.index, side: leader, margin: abs, score });
          }
        }
      }
    }
    prev = score;
  }

  // ── Pass 2: per-period beats (quarter_end, clutch_start, ot_start, identity) ──
  const periods = new Map<number, PossessionEvent[]>();
  for (const ev of events) {
    const list = periods.get(ev.quarter);
    if (list) list.push(ev); else periods.set(ev.quarter, [ev]);
  }
  const quarters = [...periods.keys()].sort((a, b) => a - b);
  const maxQuarter = quarters[quarters.length - 1];
  const identities: Record<Side, ArchetypeStatus[]> = {
    home: selectedIdentities(theater.homeTeam),
    away: selectedIdentities(theater.awayTeam),
  };

  let periodStart: Score = [0, 0];
  for (const q of quarters) {
    const list = periods.get(q)!;
    const last = list[list.length - 1];
    const endScore: Score = [last.runningScore[0], last.runningScore[1]];

    // clutch_start: first isClutch event in this period, shown before it.
    const clutchFirst = list.find(ev => ev.isClutch === true);
    if (clutchFirst) {
      const at = Math.max(0, clutchFirst.index - 1);
      const before = events.find(ev => ev.index === at)?.runningScore ?? [0, 0];
      beats.push({ type: 'clutch_start', atIndex: at, quarter: q, score: [before[0], before[1]] });
    }

    // identity: one line per side at the quarter's midpoint possession.
    const midEv = list[Math.floor(list.length / 2)];
    for (const side of ['home', 'away'] as const) {
      const status = identities[side][0];
      if (!status) continue;
      const soFar = list.slice(0, list.indexOf(midEv) + 1);
      const stats = identityStats(soFar, side, periodStart);
      const team = side === 'home' ? theater.homeTeam : theater.awayTeam;
      const text = identityLine(status.def.id, q, midEv.index, {
        ...stats, team: team.name, q: periodLabel(q, theater.overtimePeriods),
      });
      if (text) beats.push({ type: 'identity', atIndex: midEv.index, side, identityName: status.def.name, text });
    }

    // quarter_end: period score, top scorer, shooting split.
    const scorerPts = new Map<string, { side: Side; points: number }>();
    const shooting: Record<Side, { fgm: number; fga: number; tpm: number; tpa: number }> = {
      home: { fgm: 0, fga: 0, tpm: 0, tpa: 0 }, away: { fgm: 0, fga: 0, tpm: 0, tpa: 0 },
    };
    let p: Score = periodStart;
    for (const ev of list) {
      const pts = pointsOf(p, ev);
      const scorer = scoringSideOf(p, ev);
      if (pts > 0 && scorer && ev.scoringPlayerId) {
        const cur = scorerPts.get(ev.scoringPlayerId) ?? { side: scorer, points: 0 };
        cur.points += pts;
        scorerPts.set(ev.scoringPlayerId, cur);
      }
      const sh = shooting[ev.team];
      for (const shot of ev.shots ?? []) {
        sh.fga += 1;
        if (shot.made) sh.fgm += 1;
        if (shot.channel === 'three') { sh.tpa += 1; if (shot.made) sh.tpm += 1; }
      }
      p = ev.runningScore;
    }
    let topScorer: Extract<Beat, { type: 'quarter_end' }>['topScorer'] = null;
    for (const [playerId, v] of scorerPts) {
      if (!topScorer || v.points > topScorer.points) {
        topScorer = { side: v.side, playerId, name: nameOf(playerId, v.side), points: v.points };
      }
    }
    beats.push({
      type: 'quarter_end', atIndex: last.index, quarter: q, score: endScore,
      quarterScore: [endScore[0] - periodStart[0], endScore[1] - periodStart[1]],
      topScorer, shooting,
    });

    // ot_start: at the last possession of regulation and of every OT that is followed by another.
    if (theater.isOvertime && q >= 4 && q < maxQuarter) {
      beats.push({ type: 'ot_start', atIndex: last.index, period: q - 3, score: endScore });
    }

    periodStart = endScore;
  }

  // ── Pass 3: game_winner and final ──
  const last = events[events.length - 1];
  const lastScore: Score = [last.runningScore[0], last.runningScore[1]];
  const beforeLast: Score = events.length > 1 ? events[events.length - 2].runningScore : [0, 0];
  const lastPts = pointsOf(beforeLast, last);
  const lastScorer = scoringSideOf(beforeLast, last);
  const lastMargin = marginOf(lastScore);
  if (lastPts > 0 && lastScorer && lastMargin !== 0) {
    const winner: Side = lastMargin > 0 ? 'home' : 'away';
    const winnerMarginBefore = beforeLast[sideIndex(winner)] - beforeLast[sideIndex(other(winner))];
    if (winner === lastScorer && Math.abs(lastMargin) <= GAME_WINNER_MAX_MARGIN && winnerMarginBefore <= 0 && last.scoringPlayerId) {
      beats.push({
        type: 'game_winner', atIndex: last.index, side: winner,
        playerId: last.scoringPlayerId, name: nameOf(last.scoringPlayerId, winner), score: lastScore,
      });
    }
  }

  const finalScore: Score = theater.finalScore ?? lastScore;
  const finalMargin = marginOf(finalScore);
  const winner: Side = finalMargin >= 0 ? 'home' : 'away';
  const wi = sideIndex(winner);
  const li = sideIndex(other(winner));
  let largestComeback = 0;
  for (const ev of events) {
    const deficit = ev.runningScore[li] - ev.runningScore[wi];
    if (deficit > largestComeback) largestComeback = deficit;
  }
  beats.push({ type: 'final', atIndex: last.index, side: winner, score: finalScore, margin: Math.abs(finalMargin), largestComeback });

  // Stable sort by atIndex, then display priority (insertion order within a priority).
  return beats
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.atIndex - y.b.atIndex || PRIORITY[x.b.type] - PRIORITY[y.b.type] || x.i - y.i)
    .map(x => x.b);
};

// ── renderBeat ──────────────────────────────────────────────────────────────

const ORDINAL_OT = ['', 'Overtime.', 'Double overtime.', 'Triple overtime.'];

/** One broadcast line, present tense, under 110 characters, '!' only on game_winner. */
export function renderBeat(beat: Beat, theater: GameTheater): string {
  const home = theater.homeTeam.name;
  const away = theater.awayTeam.name;
  const teamOf = (side: Side) => (side === 'home' ? home : away);
  const verb = (name: string, singular: string, plural: string) => (name === 'You' ? plural : name.endsWith('s') ? plural : singular);
  switch (beat.type) {
    case 'run':
      return `${beat.points}-${beat.opponentPoints} run for ${teamOf(beat.side)}.`;
    case 'run_answered':
      return `${teamOf(beat.side)} ${verb(teamOf(beat.side), 'answers', 'answer')} the ${beat.runPoints}-0 run.`;
    case 'lead_change': {
      const [h, a] = beat.score;
      const lead = beat.side === 'home' ? `${h}-${a}` : `${a}-${h}`;
      return `Lead change: ${teamOf(beat.side)} up ${lead}.`;
    }
    case 'tie':
      return `Tied at ${beat.score[0]}.`;
    case 'largest_lead':
      return `Biggest lead of the game: ${teamOf(beat.side)} by ${beat.margin}.`;
    case 'quarter_end': {
      const label = periodLabel(beat.quarter, theater.overtimePeriods);
      const base = `End of ${label}: ${away} ${beat.score[1]}, ${home} ${beat.score[0]}.`;
      if (!beat.topScorer) return base;
      return `${base} ${beat.topScorer.name} leads with ${beat.topScorer.points}.`;
    }
    case 'clutch_start':
      return `Crunch time. ${away} ${beat.score[1]}, ${home} ${beat.score[0]}.`;
    case 'ot_start':
      return ORDINAL_OT[beat.period] ?? `Overtime number ${beat.period}.`;
    case 'identity':
      return beat.text;
    case 'game_winner': {
      const [h, a] = beat.score;
      const w = beat.side === 'home' ? `${h}-${a}` : `${a}-${h}`;
      return `${beat.name} wins it, ${w}!`;
    }
    case 'final': {
      const [h, a] = beat.score;
      const winner = teamOf(beat.side);
      const tail = beat.largestComeback >= LARGEST_LEAD_MIN ? ` after trailing by ${beat.largestComeback}` : '';
      return `Final: ${away} ${a}, ${home} ${h}. ${winner} ${verb(winner, 'wins', 'win')} by ${beat.margin}${tail}.`;
    }
  }
}
