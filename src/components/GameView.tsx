'use client';

import { useState, useEffect, useRef } from 'react';
import { GameTheater, PossessionEvent } from '../lib/gameEngine';
import { Play, FastForward, Pause, SkipForward } from 'lucide-react';

interface GameViewProps {
  game: GameTheater;
  onComplete?: () => void;
}

export function GameView({ game, onComplete }: GameViewProps) {
  const [currentPoss, setCurrentPoss] = useState(-1); // -1 = not started
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(250); // ms per possession
  const [showBoxScore, setShowBoxScore] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPoss = game.possessions.length;
  const isComplete = currentPoss >= totalPoss - 1;
  const currentEvent = currentPoss >= 0 ? game.possessions[currentPoss] : null;
  const score = currentEvent ? currentEvent.runningScore : [0, 0];
  const quarter = currentEvent?.quarter || 1;

  // Auto-play timer
  useEffect(() => {
    if (isPlaying && !isComplete) {
      timerRef.current = setInterval(() => {
        setCurrentPoss(prev => {
          const next = prev + 1;
          if (next >= totalPoss) {
            setIsPlaying(false);
            return totalPoss - 1;
          }
          return next;
        });
      }, speed);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, speed, isComplete, totalPoss]);

  // Scroll feed to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [currentPoss]);

  // Notify parent on complete
  useEffect(() => {
    if (isComplete && onComplete) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [isComplete, onComplete]);

  const handleStart = () => { setCurrentPoss(0); setIsPlaying(true); };
  const handleTogglePlay = () => setIsPlaying(prev => !prev);
  const handleSkip = () => { setCurrentPoss(totalPoss - 1); setIsPlaying(false); };
  const handleSpeedToggle = () => {
    setSpeed(prev => prev === 250 ? 100 : prev === 100 ? 50 : 250);
  };

  const visiblePossessions = game.possessions.slice(0, currentPoss + 1);

  // Quarter label
  const quarterLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;

  // Progress through quarter
  const quarterPoss = game.possessions.filter(p => p.quarter === quarter);
  const quarterProgress = quarterPoss.length > 0 
    ? ((visiblePossessions.filter(p => p.quarter === quarter).length / quarterPoss.length) * 12).toFixed(0)
    : '0';
  const timeDisplay = quarter <= 4 ? `${Math.max(0, 12 - Number(quarterProgress))}:00` : `${Math.max(0, 5 - Math.round(Number(quarterProgress) / 2.4))}:00`;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Scoreboard */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4">
          {/* Home Team */}
          <div className="flex-1 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1">{game.homeTeam.name}</div>
            <div className="text-4xl font-black text-stone-800" style={{ fontFamily: 'var(--font-bebas)' }}>{score[0]}</div>
          </div>

          {/* Center: Quarter + Time */}
          <div className="flex flex-col items-center px-6">
            <div className="text-xs font-bold uppercase tracking-widest text-stone-400">{currentPoss < 0 ? 'PRE-GAME' : isComplete ? 'FINAL' : quarterLabel}</div>
            {!isComplete && currentPoss >= 0 && (
              <div className="text-lg font-bold text-stone-600" style={{ fontFamily: 'var(--font-bebas)' }}>{timeDisplay}</div>
            )}
            {isComplete && game.isOvertime && (
              <div className="text-[10px] font-bold text-amber-600 uppercase">{game.overtimePeriods}x Overtime</div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1">{game.awayTeam.name}</div>
            <div className="text-4xl font-black text-stone-800" style={{ fontFamily: 'var(--font-bebas)' }}>{score[1]}</div>
          </div>
        </div>

        {/* Quarter scores bar */}
        {game.quarterSummaries.length > 0 && currentPoss >= 0 && (
          <div className="flex border-t border-stone-100 text-[10px] font-bold text-stone-400 uppercase">
            <div className="flex-1 text-center py-1 border-r border-stone-100">Team</div>
            {game.quarterSummaries.filter(q => q.quarter <= quarter).map(q => (
              <div key={q.quarter} className="w-10 text-center py-1 border-r border-stone-100">
                {q.quarter <= 4 ? `Q${q.quarter}` : `OT`}
              </div>
            ))}
          </div>
        )}
        {game.quarterSummaries.length > 0 && currentPoss >= 0 && (
          <>
            <div className="flex text-[11px] font-bold text-stone-600">
              <div className="flex-1 text-center py-1 border-r border-stone-100">{game.homeTeam.name}</div>
              {game.quarterSummaries.filter(q => q.quarter <= quarter).map(q => (
                <div key={q.quarter} className="w-10 text-center py-1 border-r border-stone-100">{q.homeScore}</div>
              ))}
            </div>
            <div className="flex text-[11px] font-bold text-stone-600">
              <div className="flex-1 text-center py-1 border-r border-stone-100">{game.awayTeam.name}</div>
              {game.quarterSummaries.filter(q => q.quarter <= quarter).map(q => (
                <div key={q.quarter} className="w-10 text-center py-1 border-r border-stone-100">{q.awayScore}</div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {currentPoss < 0 ? (
          <button onClick={handleStart} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold uppercase text-sm tracking-wider transition-colors">
            <Play className="w-4 h-4" /> Tip Off
          </button>
        ) : (
          <>
            <button onClick={handleTogglePlay} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleSpeedToggle} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              <FastForward className="w-4 h-4" />
              {speed === 250 ? '1×' : speed === 100 ? '2.5×' : '5×'}
            </button>
            <button onClick={handleSkip} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              <SkipForward className="w-4 h-4" /> End
            </button>
            <button onClick={() => setShowBoxScore(!showBoxScore)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${showBoxScore ? 'bg-stone-800 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
              Box Score
            </button>
          </>
        )}
      </div>

      {/* Play-by-Play Feed */}
      {!showBoxScore && currentPoss >= 0 && (
        <div ref={feedRef} className="flex-1 bg-white rounded-xl border border-stone-200 shadow-sm overflow-y-auto p-3 min-h-0">
          <div className="flex flex-col gap-1">
            {visiblePossessions.slice(-30).map((poss, i) => {
              const isScoring = poss.outcome === '2pt' || poss.outcome === '3pt' || poss.outcome === 'and1';
              const isHomeTeam = poss.team === 'home';
              return (
                <div key={poss.index} className={`flex items-start gap-2 py-1 px-2 rounded text-xs ${isScoring ? 'bg-emerald-50 font-bold' : 'text-stone-500'}`}>
                  <span className="shrink-0 text-[10px] font-mono text-stone-300 w-8">{poss.quarter <= 4 ? `Q${poss.quarter}` : 'OT'}</span>
                  <span className={`shrink-0 text-[10px] font-bold uppercase w-12 ${isHomeTeam ? 'text-blue-600' : 'text-red-500'}`}>
                    {isHomeTeam ? game.homeTeam.name.substring(0, 6) : game.awayTeam.name.substring(0, 6)}
                  </span>
                  <span className="flex-1">{poss.narrativeText}</span>
                  {isScoring && (
                    <span className="shrink-0 font-mono text-[10px] text-stone-400">
                      {poss.runningScore[0]}-{poss.runningScore[1]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Box Score */}
      {showBoxScore && (
        <div className="flex-1 bg-white rounded-xl border border-stone-200 shadow-sm overflow-y-auto p-3 min-h-0">
          {['home', 'away'].map(side => {
            const team = side === 'home' ? game.homeTeam : game.awayTeam;
            const box = side === 'home' ? game.boxScore.home : game.boxScore.away;
            return (
              <div key={side} className="mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">{team.name}</h3>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-stone-400 font-bold uppercase border-b border-stone-100">
                      <th className="text-left py-1 pr-2">Player</th>
                      <th className="text-center py-1 w-8">MIN</th>
                      <th className="text-center py-1 w-8">PTS</th>
                      <th className="text-center py-1 w-8">2FG</th>
                      <th className="text-center py-1 w-8">3FG</th>
                      <th className="text-center py-1 w-8">FT</th>
                      <th className="text-center py-1 w-8">AST</th>
                      <th className="text-center py-1 w-8">TO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {box.filter(b => b.possessions > 0).map(b => (
                      <tr key={b.playerId} className="border-b border-stone-50 text-stone-600">
                        <td className="text-left py-1 pr-2 font-bold text-stone-800 truncate max-w-[120px]">{b.playerName}</td>
                        <td className="text-center py-1">{b.minutes.toFixed(0)}</td>
                        <td className="text-center py-1 font-bold">{b.points}</td>
                        <td className="text-center py-1">{b.twoPointers}</td>
                        <td className="text-center py-1">{b.threePointers}</td>
                        <td className="text-center py-1">{b.andOnes}</td>
                        <td className="text-center py-1">{b.assists}</td>
                        <td className="text-center py-1">{b.turnovers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Final Result Banner */}
      {isComplete && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 text-center">
          <div className="text-2xl font-black uppercase tracking-wider text-stone-800" style={{ fontFamily: 'var(--font-bebas)' }}>
            Final: {game.homeTeam.name} {game.finalScore[0]} — {game.finalScore[1]} {game.awayTeam.name}
          </div>
          <div className="text-xs text-stone-400 mt-1">
            {game.finalScore[0] > game.finalScore[1] ? game.homeTeam.name : game.awayTeam.name} wins!
            {game.isOvertime && ` (${game.overtimePeriods}OT)`}
          </div>
        </div>
      )}
    </div>
  );
}
