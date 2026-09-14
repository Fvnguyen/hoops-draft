'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getGameStore } from '@/storage';
import { StorageQuotaError } from '@/storage/types';
import { useStorageReady } from './StorageProvider';
import { useCurrentProfile } from './AuthProvider';
import {
  Season, createSeason, playNextGame, normalizeSeason, humanMatchup,
  teamInfoForSeat, resolveMatchupReplay, StoredGameResult,
} from '../engine/season';
import type { DraftSession } from '../engine/deckbuilder';
import { GameTheater, TeamInfo } from '../engine/game';
import { GameView, BoxScoreOnly } from './GameView';
import { Trophy, Swords, ChevronLeft, ArrowRight, LogOut, AlertTriangle } from 'lucide-react';
import { FranchiseDashboard } from './FranchiseDashboard';

interface SeasonViewProps {
  rosterId: string;
  sessionId: string;
}

/** What's shown when a game day is open: a freshly (re)simulated theater to play back,
 *  or — when the persisted result predates the current engine (D1 balanceVersion
 *  mismatch) — just the box score. */
type ActiveGameView =
  | { kind: 'theater'; theater: GameTheater }
  | { kind: 'boxOnly'; result: StoredGameResult; homeTeam: TeamInfo; awayTeam: TeamInfo };

export function SeasonView({ rosterId, sessionId }: SeasonViewProps) {
  const router = useRouter();
  const ready = useStorageReady();
  const profile = useCurrentProfile();
  const [season, setSeason] = useState<Season | null>(null);
  const [session, setSession] = useState<DraftSession | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<ActiveGameView | null>(null);
  const [activeGameIndex, setActiveGameIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Whether the active game is a fresh play (result not yet committed to `season`/the
  // store) vs. a replay of an already-played day — a replay has nothing to lose by
  // leaving early, so it skips the finished-gate and the leave warning entirely.
  const [isFreshPlay, setIsFreshPlay] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Holds the simulated result for a fresh play until the user watches it to
  // completion and hits "Continue" — nothing is written to `season` state or the
  // store before that, so backing out early leaves the day looking unplayed.
  const pendingCommitRef = useRef<Season | null>(null);

  // Load or create season
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      const store = getGameStore();
      const loadedSession = await store.getDraftSession(sessionId);
      if (cancelled) return;

      if (!loadedSession) {
        setError('Draft session not found. The session may have been cleared from browser storage.');
        setDataLoading(false);
        return;
      }
      setSession(loadedSession);

      // Check for existing season for this roster
      const existingSeason = await store.getSeasonByRoster(rosterId);
      if (cancelled) return;

      if (existingSeason) {
        // Seasons saved before round-robin game days are upgraded on load and re-saved.
        const { season: upgraded, changed } = normalizeSeason(existingSeason);
        if (changed) {
          try { await store.saveSeason(upgraded); } catch { /* best effort; the view still works */ }
        }
        if (cancelled) return;
        setSeason(upgraded);
      } else {
        const newSeason = createSeason(loadedSession, rosterId, undefined, profile?.display_name);
        try {
          await store.saveSeason(newSeason);
        } catch (err) {
          if (!cancelled) {
            if (err instanceof StorageQuotaError) {
              setSaveError(err.message);
            } else {
              setSaveError('Failed to save season. Please try again.');
            }
          }
        }
        if (cancelled) return;
        setSeason(newSeason);
      }
      setDataLoading(false);
    })();

    return () => { cancelled = true; };
    // `profile` starts null and resolves async (AuthProvider); re-running once it
    // loads (before any season has actually been created/saved) picks up the real
    // display name instead of permanently persisting the 'You' fallback.
  }, [ready, rosterId, sessionId, profile]);

  const handlePlayGame = async (gameIndex: number) => {
    try {
      setSaveError(null);
      if (!season || !session) return;

      const entry = season.schedule[gameIndex];
      const humanMatch = humanMatchup(entry);
      if (entry.played && humanMatch?.result) {
        // Already played — re-simulate for replay (or fall back to box-score-only /
        // legacy read-only playback per D1/D8; see resolveMatchupReplay). Nothing new
        // is at stake, so this skips the finished-gate and leave warning below.
        const homeTeam = teamInfoForSeat(season, session, humanMatch.homeSeatIndex);
        const awayTeam = teamInfoForSeat(season, session, humanMatch.awaySeatIndex);
        const replay = resolveMatchupReplay(humanMatch.result, homeTeam, awayTeam);
        pendingCommitRef.current = null;
        setIsFreshPlay(false);
        setGameFinished(true);
        setActiveGame(
          replay.kind === 'versionMismatch'
            ? { kind: 'boxOnly', result: replay.result, homeTeam, awayTeam }
            : { kind: 'theater', theater: replay.theater }
        );
        setActiveGameIndex(gameIndex);
        return;
      }

      // Must be the next game in order
      if (gameIndex !== season.currentGame) return;

      // Simulate on a clone so the live `season` state (and the store) stay untouched
      // until the user actually watches the game to completion and hits "Continue" —
      // otherwise the schedule/standings would reveal the day's results immediately.
      const seasonCopy: Season = structuredClone(season);
      const result = playNextGame(seasonCopy, session);
      if (!result) return;

      pendingCommitRef.current = result.season;
      setIsFreshPlay(true);
      setGameFinished(false);
      setActiveGame({ kind: 'theater', theater: result.gameResult });
      setActiveGameIndex(gameIndex);
    } catch (err) {
      if (err instanceof StorageQuotaError) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to save season. Please try again.');
      }
    }
  };

  const closeActiveGame = () => {
    pendingCommitRef.current = null;
    setActiveGame(null);
    setActiveGameIndex(null);
    setIsFreshPlay(false);
    setGameFinished(false);
    setShowLeaveConfirm(false);
  };

  // "Continue" CTA — only reachable once the fresh play has actually finished, so this
  // is where the season's schedule/standings first learn about the new result.
  const handleContinueToSchedule = async () => {
    const pending = pendingCommitRef.current;
    if (!pending) { closeActiveGame(); return; }
    try {
      setSeason({ ...pending });
      await getGameStore().saveSeason(pending);
    } catch (err) {
      if (err instanceof StorageQuotaError) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to save season. Please try again.');
      }
    } finally {
      closeActiveGame();
    }
  };

  // "Exit Game" while a fresh play is still running — nothing has been committed yet,
  // so leaving discards the in-progress game rather than silently revealing it.
  const handleExitGame = () => {
    if (isFreshPlay && !gameFinished) {
      setShowLeaveConfirm(true);
    } else {
      closeActiveGame();
    }
  };

  if (error) {
    return (
      <div className="min-h-screen pt-[70px] p-8 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-stone-800 mb-2">Session Not Found</h2>
          <p className="text-sm text-stone-500 mb-4">{error}</p>
          <button onClick={() => router.push('/rosters')} className="px-6 py-2 bg-stone-800 text-white rounded-lg font-bold text-sm">
            Back to Rosters
          </button>
        </div>
      </div>
    );
  }

  if (!ready || dataLoading || !season || !session) {
    return (
      <div className="min-h-screen pt-[70px] flex items-center justify-center">
        <div className="text-xl font-semibold text-stone-400 animate-pulse">Loading season...</div>
      </div>
    );
  }

  // If a game is active, show GameView
  if (activeGame) {
    // A fresh, still-running play gets a distinct "Exit Game" control (warns before
    // discarding); everything else (a finished fresh play, or any replay) gets the
    // plain "Continue"/"Schedule" CTA since there's nothing left to lose.
    const exitIsDestructive = isFreshPlay && !gameFinished;
    return (
      <div className="min-h-screen pt-[70px] p-4 flex flex-col">
        <div className="mb-3 flex items-center gap-3">
          {exitIsDestructive ? (
            <button onClick={handleExitGame} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm font-bold text-red-600 hover:bg-red-100 transition-colors">
              <LogOut className="w-4 h-4" /> Exit Game
            </button>
          ) : isFreshPlay ? (
            <button onClick={handleContinueToSchedule} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors">
              Continue to Schedule <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleExitGame} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Schedule
            </button>
          )}
          <span className="text-sm font-bold text-stone-400 uppercase tracking-wider">
            Game {(activeGameIndex ?? 0) + 1} of 7
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {activeGame.kind === 'theater'
            ? <GameView game={activeGame.theater} onCompletionChange={setGameFinished} />
            : <BoxScoreOnly result={activeGame.result} homeTeamName={activeGame.homeTeam.name} awayTeamName={activeGame.awayTeam.name} />}
        </div>

        {showLeaveConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl border border-stone-200 shadow-xl p-6 max-w-sm w-full text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
              <h2 className="text-lg font-bold text-stone-800 mb-2">Leave this game?</h2>
              <p className="text-sm text-stone-500 mb-5">
                This game hasn&apos;t finished yet — if you leave now, it won&apos;t be saved and you&apos;ll need to play it again.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowLeaveConfirm(false)} className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
                  Keep Watching
                </button>
                <button onClick={closeActiveGame} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm transition-colors">
                  Leave Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Season hub: schedule + standings
  const isSeasonComplete = season.currentGame >= 7;
  const humanStanding = season.standings.find(s => s.seatId === 'human-0');
  const champion = isSeasonComplete ? season.standings[0] : null;

  return (
    <div className="min-h-screen pt-[70px] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <button onClick={() => router.push('/rosters')} className="text-xs text-stone-400 hover:text-stone-600 mb-1 flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Back to Rosters
            </button>
            <h1 className="text-3xl font-black uppercase tracking-wider text-stone-800" style={{ fontFamily: 'var(--font-bebas)' }}>
              Season
            </h1>
          </div>
          {humanStanding && (
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-widest text-stone-400">Your Record</div>
              <div className="text-2xl font-black text-stone-800" style={{ fontFamily: 'var(--font-bebas)' }}>
                {humanStanding.wins} - {humanStanding.losses}
              </div>
            </div>
          )}
        </div>

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm text-red-700 font-semibold">{saveError}</p>
          </div>
        )}

        {/* Franchise Dashboard Banner */}
        <div className="mb-6 rounded-xl overflow-hidden border border-stone-200">
          <FranchiseDashboard team={season.humanTeam} />
        </div>

        {/* Champion Banner */}
        {isSeasonComplete && champion && (
          <div className={`rounded-xl p-6 mb-6 text-center border ${champion.seatId === 'human-0' ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
            <Trophy className={`w-10 h-10 mx-auto mb-2 ${champion.seatId === 'human-0' ? 'text-amber-500' : 'text-stone-400'}`} />
            <div className="text-2xl font-black uppercase tracking-wider" style={{ fontFamily: 'var(--font-bebas)' }}>
              {champion.seatId === 'human-0' ? '🏆 You are the Champion! 🏆' : `${champion.name} wins the league`}
            </div>
            <div className="text-sm text-stone-500 mt-1">
              Final Record: {champion.wins}-{champion.losses} ({champion.pointDiff > 0 ? '+' : ''}{champion.pointDiff} pt diff)
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Schedule */}
          <div className="lg:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Schedule</h2>
            <div className="flex flex-col gap-2">
              {season.schedule.map((entry, idx) => {
                const humanMatch = humanMatchup(entry);
                if (!humanMatch) return null;
                const oppSeatIndex = humanMatch.homeSeatIndex === 0 ? humanMatch.awaySeatIndex : humanMatch.homeSeatIndex;
                const oppSeat = session?.seats[oppSeatIndex];
                const oppName = oppSeat?.botProfile?.name || `Bot ${oppSeatIndex}`;
                const isNext = idx === season.currentGame && !isSeasonComplete;
                const isPlayable = isNext;
                const result = humanMatch.result;
                const isHome = humanMatch.homeSeatIndex === 0;

                let humanScore = 0, oppScore = 0, won = false;
                if (result) {
                  humanScore = isHome ? result.finalScore[0] : result.finalScore[1];
                  oppScore = isHome ? result.finalScore[1] : result.finalScore[0];
                  won = humanScore > oppScore;
                }

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isNext ? 'border-emerald-400 bg-emerald-50' :
                      entry.played ? 'border-stone-200 bg-white' :
                      'border-stone-100 bg-stone-50 opacity-60'
                    } ${(entry.played || isPlayable) ? 'cursor-pointer hover:border-stone-300' : ''}`}
                    onClick={() => (entry.played || isPlayable) ? handlePlayGame(idx) : null}
                  >
                    <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-stone-800">
                        {isHome ? 'vs' : '@'} {oppName}
                      </div>
                      <div className="text-[10px] text-stone-400 uppercase">
                        Game {idx + 1} • {isHome ? 'Home' : 'Away'}
                      </div>
                    </div>
                    {entry.played && result ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${won ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {won ? 'W' : 'L'}
                        </span>
                        <span className="text-sm font-bold text-stone-600 font-mono">
                          {humanScore}-{oppScore}
                        </span>
                      </div>
                    ) : isPlayable ? (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm">
                        <Swords className="w-4 h-4" /> Play <ArrowRight className="w-3 h-3" />
                      </div>
                    ) : (
                      <span className="text-xs text-stone-300 uppercase font-bold">Upcoming</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Standings */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Standings</h2>
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 text-stone-400 font-bold uppercase">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2">Team</th>
                    <th className="text-center py-2 w-8">W</th>
                    <th className="text-center py-2 w-8">L</th>
                    <th className="text-center py-2 px-3 w-12">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {season.standings.map((entry, idx) => {
                    const isHuman = entry.seatId === 'human-0';
                    const hasPlayed = entry.wins + entry.losses > 0;
                    return (
                      <tr key={entry.seatId} className={`border-t border-stone-100 ${isHuman ? 'bg-blue-50 font-bold' : ''}`}>
                        <td className="py-2 px-3 text-stone-400">{idx + 1}</td>
                        <td className={`py-2 ${isHuman ? 'text-blue-700' : 'text-stone-700'}`}>
                          {entry.name}
                        </td>
                        <td className="text-center py-2 text-stone-600">{entry.wins}</td>
                        <td className="text-center py-2 text-stone-600">{entry.losses}</td>
                        <td className={`text-center py-2 px-3 font-mono ${entry.pointDiff > 0 ? 'text-emerald-600' : entry.pointDiff < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                          {hasPlayed ? (entry.pointDiff > 0 ? '+' : '') + entry.pointDiff : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
