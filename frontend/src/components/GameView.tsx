'use client';

import { useState, useEffect, useRef } from 'react';
import { GameTheater, PossessionEvent } from '../engine/game';
import { Play as PlayIcon, FastForward, Pause, SkipForward } from 'lucide-react';
import { calcRosterIdentity, resolveDepthChart } from '../engine/rosterStats';
import { calcTeamBonuses } from '../engine/synergies';
import { MiniPlayerCard } from './PlayerCard';

interface GameViewProps {
  game: GameTheater;
  onComplete?: () => void;
}

export function TeamStarters({ team, isHome }: { team: any, isHome: boolean }) {
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

export function TaleOfTheTape({ game }: { game: any }) {
  const homeDepth = resolveDepthChart(game.homeTeam.players, game.homeTeam.depthChart);
  const homeId = calcRosterIdentity(homeDepth);
  const awayDepth = resolveDepthChart(game.awayTeam.players, game.awayTeam.depthChart);
  const awayId = calcRosterIdentity(awayDepth);
  
  const allHome = Object.values(homeDepth).flat() as any[];
  const homeBonuses = calcTeamBonuses(allHome, game.homeTeam.plays, new Map());
  
  const allAway = Object.values(awayDepth).flat() as any[];
  const awayBonuses = calcTeamBonuses(allAway, game.awayTeam.plays, new Map());

  const bars = [
    { label: 'Finishing', h: homeId.finishing, a: awayId.finishing, color: 'bg-purple-500' },
    { label: 'Mid-Range', h: homeId.midRange, a: awayId.midRange, color: 'bg-purple-500' },
    { label: '3PT', h: homeId.perimeter, a: awayId.perimeter, color: 'bg-purple-500' },
    { label: 'Perimeter D', h: homeId.perDef, a: awayId.perDef, color: 'bg-teal-500' },
    { label: 'Post Def', h: homeId.postDef, a: awayId.postDef, color: 'bg-teal-500' },
    { label: 'Playmaking', h: homeId.playmaking, a: awayId.playmaking, color: 'bg-pink-500' },
    { label: 'Rebounding', h: homeId.rebounding, a: awayId.rebounding, color: 'bg-pink-500' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 bg-stone-50 overflow-y-auto h-full">
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">{game.awayTeam.name} Mechanics</h3>
          <div className="space-y-1 text-xs">
             {awayBonuses.activeSynergies.map((s: any) => <div key={s.name} className="text-stone-600 flex items-center gap-1.5"><span className="text-emerald-500 text-[10px]">✦</span> {s.name}</div>)}
             {awayBonuses.activePlays.filter((p: any) => p.activated === 'full').map((p: any) => <div key={p.name} className="text-stone-600 flex items-center gap-1.5"><span className="text-amber-500 text-[10px]">▶</span> {p.name}</div>)}
             {awayBonuses.activeSynergies.length === 0 && awayBonuses.activePlays.filter((p: any) => p.activated === 'full').length === 0 && <div className="text-stone-400 italic">No fully active mechanics.</div>}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">{game.homeTeam.name} Mechanics</h3>
          <div className="space-y-1 text-xs">
             {homeBonuses.activeSynergies.map((s: any) => <div key={s.name} className="text-stone-600 flex items-center gap-1.5"><span className="text-emerald-500 text-[10px]">✦</span> {s.name}</div>)}
             {homeBonuses.activePlays.filter((p: any) => p.activated === 'full').map((p: any) => <div key={p.name} className="text-stone-600 flex items-center gap-1.5"><span className="text-amber-500 text-[10px]">▶</span> {p.name}</div>)}
             {homeBonuses.activeSynergies.length === 0 && homeBonuses.activePlays.filter((p: any) => p.activated === 'full').length === 0 && <div className="text-stone-400 italic">No fully active mechanics.</div>}
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4 text-center">Team Identity Matchup</h3>
        <div className="flex flex-col gap-2">
          {bars.map(b => (
            <div key={b.label} className="flex items-center gap-4">
              <div className="flex-1 flex justify-end">
                 <div className="h-2 bg-stone-100 rounded-full border border-stone-300 overflow-hidden w-full max-w-[150px]">
                   <div className={`h-full ${b.color} float-right`} style={{ width: `${Math.min(100, (b.a / 100) * 100)}%` }}></div>
                 </div>
              </div>
              <div className="w-[85px] text-center text-[10px] font-bold uppercase tracking-widest text-stone-600">{b.label}</div>
              <div className="flex-1 flex justify-start">
                 <div className="h-2 bg-stone-100 rounded-full border border-stone-300 overflow-hidden w-full max-w-[150px]">
                   <div className={`h-full ${b.color}`} style={{ width: `${Math.min(100, (b.h / 100) * 100)}%` }}></div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GameView({ game, onComplete }: GameViewProps) {
  const [currentPoss, setCurrentPoss] = useState(-1); // -1 = not started
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(500); // ms per possession
  const [activeTab, setActiveTab] = useState<'playByPlay' | 'boxScore' | 'matchup'>(currentPoss < 0 ? 'matchup' : 'playByPlay');
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

  const handleStart = () => { setCurrentPoss(0); setIsPlaying(true); setActiveTab('playByPlay'); };
  const handleTogglePlay = () => setIsPlaying(prev => !prev);
  const handleSkip = () => { setCurrentPoss(totalPoss - 1); setIsPlaying(false); };
  const handleSpeedToggle = () => {
    setSpeed(prev => prev === 500 ? 200 : prev === 200 ? 80 : 500);
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
        <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
          {/* Away Team (Left) */}
          <div className="flex-1 text-left flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-xs font-bold uppercase tracking-widest text-stone-800">{game.awayTeam.name}</div>
              <div className="text-[9px] font-black uppercase text-stone-400 bg-stone-200 px-1.5 py-0.5 rounded">Away</div>
            </div>
            <div className="text-4xl font-black text-stone-800 leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>{score[1]}</div>
            <div className="mt-3"><TeamStarters team={game.awayTeam} isHome={false} /></div>
          </div>

          {/* Center: Quarter + Time */}
          <div className="flex flex-col items-center px-6 min-w-[120px]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">
              {currentPoss < 0 ? 'PRE-GAME' : isComplete ? 'FINAL' : quarterLabel}
            </div>
            {!isComplete && currentPoss >= 0 && (
              <div className="text-lg font-bold text-stone-600 leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>{timeDisplay}</div>
            )}
            {isComplete && game.isOvertime && (
              <div className="text-[10px] font-bold text-amber-600 uppercase mt-1">{game.overtimePeriods}x Overtime</div>
            )}
            {currentPoss < 0 && <div className="text-3xl font-black text-stone-300 italic my-1" style={{ fontFamily: 'var(--font-bebas)' }}>VS</div>}
          </div>

          {/* Home Team (Right) */}
          <div className="flex-1 text-right flex flex-col justify-center items-end">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[9px] font-black uppercase text-stone-400 bg-stone-200 px-1.5 py-0.5 rounded">Home</div>
              <div className="text-xs font-bold uppercase tracking-widest text-stone-800">{game.homeTeam.name}</div>
            </div>
            <div className="text-4xl font-black text-stone-800 leading-none" style={{ fontFamily: 'var(--font-bebas)' }}>{score[0]}</div>
            <div className="mt-3"><TeamStarters team={game.homeTeam} isHome={true} /></div>
          </div>
        </div>

        {/* Quarter scores bar */}
        {game.quarterSummaries.length > 0 && currentPoss >= 0 && (
          <div className="flex text-[11px] font-bold text-stone-600 border-t border-stone-100 bg-white">
            <div className="flex-1"></div>
            {game.quarterSummaries.filter(q => q.quarter <= quarter).map(q => (
              <div key={q.quarter} className="w-10 text-center py-1 flex flex-col border-l border-stone-100">
                <span className="text-[9px] text-stone-400 border-b border-stone-100">{q.quarter <= 4 ? `Q${q.quarter}` : `OT`}</span>
                <span className="py-0.5">{q.awayScore}</span>
                <span className="border-t border-stone-100 py-0.5">{q.homeScore}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {currentPoss < 0 ? (
          <>
            <button onClick={handleStart} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold uppercase text-sm tracking-wider transition-colors">
              <PlayIcon className="w-4 h-4" /> Tip Off
            </button>
            <button onClick={() => setActiveTab('matchup')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'matchup' ? 'bg-stone-800 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
              Matchup Preview
            </button>
          </>
        ) : (
          <>
            <button onClick={handleTogglePlay} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              {isPlaying ? <Pause className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleSpeedToggle} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              <FastForward className="w-4 h-4" />
              {speed === 500 ? '1×' : speed === 200 ? '2×' : '5×'}
            </button>
            <button onClick={handleSkip} className="flex items-center gap-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold text-sm transition-colors">
              <SkipForward className="w-4 h-4" /> End
            </button>
            <div className="w-px h-6 bg-stone-200 mx-1"></div>
            <button onClick={() => setActiveTab('matchup')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'matchup' ? 'bg-stone-800 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
              Matchup
            </button>
            <button onClick={() => setActiveTab('playByPlay')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'playByPlay' ? 'bg-stone-800 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
              Play-by-Play
            </button>
            <button onClick={() => setActiveTab('boxScore')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'boxScore' ? 'bg-stone-800 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
              Box Score
            </button>
          </>
        )}
      </div>

      <div className="flex-1 bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden min-h-0 flex flex-col">
        {activeTab === 'matchup' && <TaleOfTheTape game={game} />}
        
        {/* Play-by-Play Feed */}
        {activeTab === 'playByPlay' && currentPoss >= 0 && (
          <div ref={feedRef} className="flex-1 overflow-y-auto p-3">
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
        {activeTab === 'boxScore' && (
          <div className="flex-1 overflow-y-auto p-3">
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
      </div>

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
