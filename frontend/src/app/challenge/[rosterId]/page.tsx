'use client';

/**
 * challenge_mode — `/challenge/[rosterId]`: the 82:0 run.
 *
 * This page owns the run's PHASE MACHINE and nothing else. Per D7 the reveal is
 * presentation over a finished sim, so the order is always the same: simulate the half
 * in one call, COMMIT it to the store, and only then mount `ChallengeReel` over the
 * committed results. A reload lands back here, finds the same `ChallengeRun` by roster,
 * and replays whatever that run already holds — it can never re-roll a result, because
 * nothing is ever simulated for a half that is already in `run.halves`.
 *
 *   first  -> reel over halves[0]        (simulate half 1 if missing)
 *   break  -> front office (T7)          <- "Spin the second half" moves us on
 *   second -> reel over halves[1]        (simulate half 2 if missing, off rosterPost)
 *   done   -> results (T8)
 *
 * D2: challenge routes are dark. Rather than hand-picking inverse tokens screen by
 * screen, the shell below switches the whole subtree to `data-theme="night"` — the
 * theme contract in globals.css is exactly one attribute, and under night the ordinary
 * semantic tokens already resolve to exactly the boards' palette (the deep stone shell,
 * the raised stone flap and the amber accent). Everything under here keeps plain `bg-surface` /
 * `text-ink`, so the components stay theme-agnostic and reusable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getGameStore } from '@/storage';
import type { ChallengeRun, SavedRoster } from '@/storage/types';
import { useStorageReady } from '@/components/StorageProvider';
import { getAllCards } from '@/engine/cards';
import { PLAY_CATALOG } from '@/engine/plays';
import { buildTeamInfo } from '@/engine/game';
import { randomSeed } from '@/engine/rng';
import { BALANCE_VERSION, CHALLENGE_GAMES } from '@/engine/balance';
import {
  buildChallengeSchedule, buildNbaTeams, simulateHalf, gradeForWins,
  type ChallengeHalf,
} from '@/engine/challenge';
import { FrontOffice } from '@/components/challenge/FrontOffice';
import { ChallengeReel } from '@/components/challenge/ChallengeReel';
import { FlipClock } from '@/components/challenge/FlipClock';
import { TierLadder } from '@/components/challenge/TierLadder';
import { seatFromRoster } from '@/components/challenge/rosterSeat';
import { Button } from '@/components/ui';

/** Trailing win streak of a half's W/L string — so a streak can survive the break. */
function trailingStreak(results: string): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === 'W'; i--) n++;
  return n;
}

export default function ChallengePage() {
  const params = useParams();
  const rosterId = decodeURIComponent(String(params.rosterId ?? ''));
  const ready = useStorageReady();

  const [roster, setRoster] = useState<SavedRoster | null>(null);
  const [run, setRun] = useState<ChallengeRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── load or create the run ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !rosterId) return;
    let cancelled = false;

    (async () => {
      const store = getGameStore();
      const saved = await store.getRoster(rosterId);
      if (cancelled) return;
      if (!saved) {
        setError(`Roster ${rosterId} was not found in this browser's storage.`);
        return;
      }

      // D1: a roster can only start the mode it was drafted for.
      const session = saved.sessionId ? await store.getDraftSession(saved.sessionId) : null;
      if (cancelled) return;
      if (session && (session.gameMode ?? 'tournament') !== 'challenge') {
        setError('This roster was drafted for the In-Season Tournament, not the 82:0 Challenge.');
        return;
      }

      const existing = await store.getChallengeRunByRoster(rosterId);
      if (cancelled) return;
      setRoster(saved);

      if (existing) {
        setRun(existing);
        return;
      }

      const created: ChallengeRun = {
        id: `challenge_${Date.now()}`,
        sessionId: saved.sessionId ?? '',
        rosterId,
        timestamp: new Date().toISOString(),
        seed: randomSeed(),
        balanceVersion: BALANCE_VERSION,
        phase: 'first',
        rosterPre: saved,
        halves: [],
      };
      await store.saveChallengeRun(created);
      if (cancelled) return;
      setRun(created);
    })().catch((err) => {
      console.error('Failed to open the challenge run:', err);
      if (!cancelled) setError('Could not open this 82:0 run.');
    });

    return () => { cancelled = true; };
  }, [ready, rosterId]);

  const commit = useCallback(async (next: ChallengeRun) => {
    setRun(next);
    try {
      await getGameStore().saveChallengeRun(next);
    } catch (err) {
      // The reveal must not stall on a storage hiccup; the run is still in memory and
      // the next transition re-saves the whole record.
      console.error('Failed to save the challenge run:', err);
    }
  }, []);

  // ── simulate whichever half the current phase needs, then commit it ───────
  const needsHalf: 1 | 2 | null = useMemo(() => {
    if (!run) return null;
    if (run.phase === 'first' && run.halves.length === 0) return 1;
    if (run.phase === 'second' && run.halves.length === 1) return 2;
    return null;
  }, [run]);

  const simulating = useRef<string | null>(null);

  useEffect(() => {
    if (!run || !roster || needsHalf === null) return;
    const token = `${run.id}:${needsHalf}`;
    if (simulating.current === token) return;
    simulating.current = token;
    setBusy(true);

    // Out of the render path: building 30 opponents and playing 41 games is ~150ms of
    // synchronous work, and D7 wants it finished before a single flap turns.
    const timer = window.setTimeout(() => {
      try {
        const cards = getAllCards();
        // Real NBA rosters are locked-in: a drafted player still suits up for his own
        // team against you (owner decision, 2026-09-17).
        const opponents = buildNbaTeams(cards, PLAY_CATALOG);
        const schedule = buildChallengeSchedule(run.seed);
        const source = needsHalf === 2 ? (run.rosterPost ?? run.rosterPre) : run.rosterPre;
        const userTeam = buildTeamInfo(seatFromRoster(source), true, source.name || 'Your team');
        const half = simulateHalf(userTeam, opponents, schedule, needsHalf, run.seed);

        // D10's ghost: the SAME 41 seeds replayed with the roster as it stood at the
        // deadline, so the results screen can say what the trade and the lineup edits were
        // actually worth. Only meaningful when the roster changed — with no edit the ghost
        // would be the real run, and a dashed line lying exactly on top of the solid one
        // reads as a bug rather than as "you changed nothing".
        const changed = needsHalf === 2 && run.rosterPost && run.rosterPost !== run.rosterPre;
        const ghost = changed
          ? simulateHalf(
              buildTeamInfo(seatFromRoster(run.rosterPre), true, run.rosterPre.name || 'Your team'),
              opponents, schedule, 2, run.seed,
            )
          : undefined;

        void commit({ ...run, halves: [...run.halves, half], ...(ghost ? { ghost } : {}) });
      } catch (err) {
        console.error('Challenge simulation failed:', err);
        setError('The season could not be simulated for this roster.');
      } finally {
        setBusy(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [run, roster, needsHalf, commit]);

  // ── phase transitions ────────────────────────────────────────────────────
  const finishFirstHalf = useCallback(() => {
    setRun((r) => {
      if (!r || r.phase !== 'first') return r;
      const next: ChallengeRun = { ...r, phase: 'break' };
      void getGameStore().saveChallengeRun(next).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Takes the run FrontOffice hands back rather than this page's own state. FrontOffice
   * persists `rosterPost` and `trade` straight to the store, which never flows back into
   * `run` here — spreading the local copy would have written a run with no trade and the
   * pre-trade roster over the top of it, and the second half would then be simulated off
   * the roster the user just finished editing away.
   */
  const startSecondHalf = useCallback((updated: ChallengeRun) => {
    setRun((r) => {
      const base = updated ?? r;
      if (!base || base.phase !== 'break') return r;
      const next: ChallengeRun = { ...base, phase: 'second' };
      void getGameStore().saveChallengeRun(next).catch(() => {});
      return next;
    });
  }, []);

  const finishRun = useCallback(() => {
    setRun((r) => {
      if (!r || r.phase !== 'second') return r;
      const next: ChallengeRun = { ...r, phase: 'done' };
      void getGameStore().saveChallengeRun(next).catch(() => {});
      return next;
    });
  }, []);

  // ── render ───────────────────────────────────────────────────────────────
  const schedule = useMemo(() => (run ? buildChallengeSchedule(run.seed) : []), [run]);

  let body: React.ReactNode;

  if (error) {
    body = <Notice title="Can't start this run" detail={error} action={{ href: '/rosters', label: 'My rosters' }} />;
  } else if (!run || !roster) {
    body = <Notice title="Loading" detail="Opening your 82:0 run…" />;
  } else if (run.phase === 'first' || run.phase === 'second') {
    const index = run.phase === 'first' ? 0 : 1;
    const half: ChallengeHalf | undefined = run.halves[index];
    if (!half) {
      body = <Notice title={busy ? 'Simulating' : 'Tip-off'} detail="Playing all 41 games before the first flap turns…" />;
    } else {
      const prior = index === 1 ? run.halves[0] : undefined;
      body = (
        <ChallengeReel
          key={`${run.id}-${half.half}`}
          half={half}
          schedule={schedule}
          priorWins={prior?.wins ?? 0}
          priorLosses={prior?.losses ?? 0}
          priorStreak={prior ? trailingStreak(prior.results) : 0}
          ghostWins={run.ghost?.wins === undefined || !prior ? undefined : prior.wins + run.ghost.wins}
          onComplete={index === 0 ? finishFirstHalf : finishRun}
        />
      );
    }
  } else if (run.phase === 'break') {
    body = <FrontOffice run={run} onSpin={startSecondHalf} />;
  } else {
    body = <DonePlaceholder run={run} />;
  }

  return (
    <div data-theme="night" className="min-h-dvh-z bg-surface text-ink">
      {body}
    </div>
  );
}

/** Loading / error card, in the same dark shell as the reel. */
function Notice({ title, detail, action }: {
  title: string;
  detail: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex h-dvh-z flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="font-display text-5xl leading-none text-accent">82:0</span>
      <h1 className="text-xl font-black uppercase tracking-widest text-ink-strong">{title}</h1>
      <p className="max-w-md text-sm text-ink-muted">{detail}</p>
      {action && <Button href={action.href} variant="secondary">{action.label}</Button>}
    </div>
  );
}

/**
 * T7 MOUNT POINT. The All-Star break (boards 4 and 5): coach/owner/fans quotes over
 * `engine/challengeAdvice.ts`, the pace band on `TierLadder`, lineup/plays/identity
 * edits and the one optional trade. T7 replaces this whole component; the only contract
 * it has to keep is calling `onSpin` when the user presses "Spin the second half" —
 * that is what moves `phase` to `second` and lets this page simulate games 42-82 off
 * `run.rosterPost ?? run.rosterPre`.
 *
 * Until then this renders the break honestly: the record is deliberately NOT shown as a
 * W-L (D8 forbids it), only the projection band the front office is built around.
 */
/**
 * T8 MOUNT POINT. Board 7's results screen: grade slam, win trend with the ghost line,
 * trade verdict, season MVP, seed chip and share card. This placeholder shows only the
 * final record and grade so the phase machine can be walked end to end.
 */
function DonePlaceholder({ run }: { run: ChallengeRun }) {
  const wins = run.halves.reduce((a, h) => a + h.wins, 0);
  const losses = run.halves.reduce((a, h) => a + h.losses, 0);
  const grade = gradeForWins(wins);

  return (
    <div className="flex h-dvh-z flex-col items-center justify-center gap-8 px-8">
      <div className="flex flex-col items-center gap-2">
        <span className="font-display text-8xl leading-none text-accent">{grade.grade}</span>
        <span className="text-sm font-black uppercase tracking-widest text-ink-muted">{grade.title}</span>
      </div>
      <FlipClock wins={wins} losses={losses} size="sm" />
      <TierLadder wins={wins} className="w-full max-w-5xl" />
      <p className="text-xs text-ink-subtle">Results screen (board 7) is task T8.</p>
      <Button href="/rosters" variant="secondary">My rosters</Button>
    </div>
  );
}
