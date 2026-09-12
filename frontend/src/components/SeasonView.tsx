'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDraftSession, saveSeason, getSeasonByRoster } from '../lib/legacyStorage';
import { Season, createSeason, playNextGame } from '../engine/season';
import { GameTheater } from '../engine/game';
import { GameView } from './GameView';
import { Trophy, Swords, ChevronLeft, ArrowRight } from 'lucide-react';
import { FranchiseDashboard } from './FranchiseDashboard';
import { StorageQuotaError } from '../lib/storage';

interface SeasonViewProps {
  rosterId: string;
  sessionId: string;
}

export function SeasonView({ rosterId, sessionId }: SeasonViewProps) {
  const router = useRouter();
  const [season, setSeason] = useState<Season | null>(null);
  const [activeGame, setActiveGame] = useState<GameTheater | null>(null);
  const [activeGameIndex, setActiveGameIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load or create season
  useEffect(() => {
    const session = getDraftSession(sessionId);
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Draft session not found. The session may have been cleared from browser storage.');
      return;
    }

    // Check for existing season for this roster
    const existingSeason = getSeasonByRoster(rosterId);
    if (existingSeason) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeason(existingSeason);
    } else {
      const newSeason = createSeason(session, rosterId);
      saveSeason(newSeason);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeason(newSeason);
    }
  }, [rosterId, sessionId]);

  const handlePlayGame = (gameIndex: number) => {
    try {
      setSaveError(null);
      if (!season) return;
      const session = getDraftSession(sessionId);
      if (!session) return;

      const entry = season.schedule[gameIndex];
      if (entry.played && entry.result) {
        // Already played — show replay
        setActiveGame(entry.result);
        setActiveGameIndex(gameIndex);
        return;
      }

      // Must be the next game in order
      if (gameIndex !== season.currentGame) return;

      const result = playNextGame(season, session);
      if (!result) return;

      setSeason({ ...result.season });
      saveSeason(result.season);
      setActiveGame(result.gameResult);
      setActiveGameIndex(gameIndex);
    } catch (err) {
      if (err instanceof StorageQuotaError) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to save season. Please try again.');
      }
    }
  };

  const handleGameComplete = () => {
    // Nothing special — user can navigate back to schedule
  };

  const handleBackToSchedule = () => {
    setActiveGame(null);
    setActiveGameIndex(null);
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

  if (!season) {
    return (
      <div className="min-h-screen pt-[70px] flex items-center justify-center">
        <div className="text-xl font-semibold text-stone-400 animate-pulse">Loading season...</div>
      </div>
    );
  }

  // If a game is active, show GameView
  if (activeGame) {
    return (
      <div className="min-h-screen pt-[70px] p-4 flex flex-col">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={handleBackToSchedule} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Schedule
          </button>
          <span className="text-sm font-bold text-stone-400 uppercase tracking-wider">
            Game {(activeGameIndex ?? 0) + 1} of 7
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <GameView game={activeGame} onComplete={handleGameComplete} />
        </div>
      </div>
    );
  }

  // Season hub: schedule + standings
  const isSeasonComplete = season.currentGame >= 7;
  const humanStanding = season.standings.find(s => s.seatId === 'human-0');
  const champion = isSeasonComplete ? season.standings[0] : null;

  return (
    <div className="min-h-screen pt-[70px] p-6">
      <div className="max-w-4xl mx-auto">
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
                const session = getDraftSession(sessionId);
                const oppSeat = session?.seats[entry.opponentSeatIndex];
                const oppName = oppSeat?.botProfile?.name || `Bot ${entry.opponentSeatIndex}`;
                const isNext = idx === season.currentGame && !isSeasonComplete;
                const isPlayable = isNext;
                const result = entry.result;
                const isHome = idx % 2 === 0;

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
