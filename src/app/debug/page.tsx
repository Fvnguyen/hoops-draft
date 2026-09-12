'use client';

import { useState, useEffect, useCallback } from 'react';

function mean(arr: number[]) { return arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0; }
function med(arr: number[]) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
function sd(arr: number[]) { if (arr.length<=1) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length); }
function pct(n: number, d: number) { return d ? ((n/d)*100).toFixed(1)+'%' : '0.0%'; }
function corr(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) return 0;
  const mx=mean(x), my=mean(y); let num=0,d1=0,d2=0;
  for (let i=0;i<x.length;i++){const dx=x[i]-mx,dy=y[i]-my;num+=dx*dy;d1+=dx*dx;d2+=dy*dy;}
  const d=Math.sqrt(d1*d2); return d===0?0:num/d;
}

function loadData() {
  return {
    sessions: JSON.parse(localStorage.getItem('hoops-draft-sessions') || '[]'),
    seasons: JSON.parse(localStorage.getItem('hoops-draft-seasons') || '[]'),
    rosters: JSON.parse(localStorage.getItem('myRosters') || '[]'),
  };
}

function analyzeData(data: any): string[] {
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);
  const sessions = data.sessions || [];
  const seasons = data.seasons || [];

  log('═'.repeat(65));
  log('  NBA CARD GAME — DRAFT, SEASON & BALANCE ANALYTICS');
  log('═'.repeat(65));
  log(`Draft Sessions: ${sessions.length} | Seasons: ${seasons.length}`);

  const allGames: any[] = [];
  seasons.forEach((season: any) => {
    (season.schedule || []).forEach((entry: any, gIdx: number) => {
      if (entry.played && entry.result) {
        allGames.push({ gameIndex: entry.gameIndex ?? gIdx, result: entry.result });
      }
    });
  });
  log(`Games Played: ${allGames.length}`);
  log('─'.repeat(65));

  // ── DRAFT ──
  log('\n📋 DRAFT ANALYSIS');
  log('─'.repeat(65));
  if (!sessions.length) { log('No draft sessions found.'); }
  else {
    sessions.forEach((session: any, sIdx: number) => {
      log(`\n▶ Session #${sIdx + 1} (${session.id})`);
      const seats = session.seats || [];
      const pickLog = session.pickLog || [];
      const allCards = seats.flatMap((s: any) => s.drafted || []);
      const players = allCards.filter((c: any) => c.type === 'Player');
      const plays = allCards.filter((c: any) => c.type === 'Play');
      const playerIds = players.map((p: any) => p.id);
      const uniqueIds = new Set(playerIds);
      const dupes = playerIds.length - uniqueIds.size;

      log(`  Cards: ${allCards.length} (${players.length} players, ${plays.length} plays)`);
      log(`  Cube Uniqueness: ${uniqueIds.size}/${players.length} — ${dupes === 0 ? '✅ PASS' : `⚠️ ${dupes} DUPLICATES`}`);

      const rarity: Record<string,number> = { Mythic:0, Rare:0, Uncommon:0, Common:0 };
      allCards.forEach((c: any) => { if (rarity[c.rarity] !== undefined) rarity[c.rarity]++; });
      log(`  Rarity: ${Object.entries(rarity).map(([r,c]) => `${r}:${c}`).join(' | ')}`);

      const POS = ['PG','SG','SF','PF','C'];
      let covered = 0;
      seats.forEach((seat: any) => {
        const dc = seat.builtRoster?.depthChart || {};
        if (POS.every((p: string) => (dc[p] || []).length >= 1)) covered++;
      });
      log(`  Position coverage: ${covered}/${seats.length} seats`);

      if (pickLog.length > 0) {
        const ovrByPick: Record<number,number[]> = {};
        for (let p=1;p<=12;p++) ovrByPick[p]=[];
        pickLog.forEach((rec: any) => {
          const card = allCards.find((c: any) => c.id === rec.pickedCardId);
          if (card?.type === 'Player' && card.ratings?.overall && ovrByPick[rec.pickNumber]) {
            ovrByPick[rec.pickNumber].push(card.ratings.overall);
          }
        });
        log('  Avg OVR by Pick:');
        for (let p=1;p<=12;p++) {
          const ovrs = ovrByPick[p];
          const avg = ovrs.length ? mean(ovrs).toFixed(1) : 'N/A';
          const bar = ovrs.length ? '█'.repeat(Math.max(1,Math.round((mean(ovrs)-55)/2))) : '';
          log(`    #${String(p).padStart(2)}: ${String(avg).padStart(5)} ${bar}`);
        }
        const early = mean([1,2,3,4].flatMap(p => ovrByPick[p]));
        const late = mean([9,10,11,12].flatMap(p => ovrByPick[p]));
        log(`  Gradient: Early(1-4) ${early.toFixed(1)} vs Late(9-12) ${late.toFixed(1)} → gap ${(early-late).toFixed(1)}`);

        const r1p1 = pickLog.filter((p: any) => p.packNumber===1 && p.pickNumber===1);
        log('  Round 1 Pick 1:');
        r1p1.forEach((p: any) => {
          const card = allCards.find((c: any) => c.id === p.pickedCardId);
          const name = card?.player?.name || card?.name || p.pickedCardId;
          const ovr = card?.ratings?.overall ? `${card.ratings.overall} OVR` : card?.rarity || '';
          log(`    ${p.seatId.padEnd(10)}: ${name} (${ovr})`);
        });
      }
    });
  }

  // ── GAMES ──
  log('\n\n🏀 GAME & SEASON ANALYSIS');
  log('─'.repeat(65));
  if (!allGames.length) { log('No completed games.'); }
  else {
    const teamScores: number[] = [], gameTotals: number[] = [], margins: number[] = [];
    let otGames = 0, otPeriods = 0;
    const outcomes: Record<string,number> = { '2pt':0, '3pt':0, and1:0, turnover:0, miss:0 };
    let totalPoss = 0;
    const possPerGame: number[] = [];
    const botH2H: Record<string,{w:number,l:number,pf:number,pa:number}> = {};

    allGames.forEach(({ result }: any) => {
      const [h,a] = result.finalScore || [0,0];
      teamScores.push(h,a); gameTotals.push(h+a); margins.push(Math.abs(h-a));
      if (result.isOvertime) { otGames++; otPeriods += (result.overtimePeriods||1); }
      const pc = result.possessions?.length || 0;
      if (pc>0) possPerGame.push(pc);
      (result.possessions||[]).forEach((p: any) => { totalPoss++; if (outcomes[p.outcome]!==undefined) outcomes[p.outcome]++; });

      const homeIsH = result.homeTeam?.seatId === 'human-0';
      const awayIsH = result.awayTeam?.seatId === 'human-0';
      if (homeIsH || awayIsH) {
        const won = homeIsH ? h>a : a>h;
        const opp = homeIsH ? result.awayTeam : result.homeTeam;
        const name = opp?.name || opp?.seatId || '?';
        if (!botH2H[name]) botH2H[name] = {w:0,l:0,pf:0,pa:0};
        botH2H[name][won?'w':'l']++;
        botH2H[name].pf += homeIsH?h:a;
        botH2H[name].pa += homeIsH?a:h;
      }
    });

    log(`\n  Score Distribution (${teamScores.length} team-games):`);
    log(`    Min: ${Math.min(...teamScores)} | Max: ${Math.max(...teamScores)} | Avg: ${mean(teamScores).toFixed(1)} | Median: ${med(teamScores).toFixed(1)} | StdDev: ±${sd(teamScores).toFixed(1)}`);
    log(`    Game Total: Avg ${mean(gameTotals).toFixed(1)} | Range ${Math.min(...gameTotals)}–${Math.max(...gameTotals)}`);

    const realistic = teamScores.filter(s => s>=90 && s<=130).length;
    const low = teamScores.filter(s => s<90).length;
    const high = teamScores.filter(s => s>130).length;
    log(`    NBA Range [90–130]: ${pct(realistic,teamScores.length)} | <90: ${pct(low,teamScores.length)} | >130: ${pct(high,teamScores.length)}`);

    const close = margins.filter(m => m<=5).length;
    const moderate = margins.filter(m => m>=6 && m<=14).length;
    const blowout = margins.filter(m => m>=15).length;
    log(`\n  Margins: Avg ${mean(margins).toFixed(1)} | Close(≤5): ${pct(close,margins.length)} | Mid(6-14): ${pct(moderate,margins.length)} | Blowout(15+): ${pct(blowout,margins.length)}`);

    log('\n  Human vs Bots:');
    let totalW=0, totalG=0;
    Object.entries(botH2H).forEach(([name,rec]) => {
      totalW+=rec.w; totalG+=rec.w+rec.l;
      const diff = rec.pf-rec.pa;
      log(`    vs ${name.padEnd(18)}: ${rec.w}-${rec.l}  Pts: ${rec.pf}-${rec.pa} (${diff>=0?'+':''}${diff})`);
    });
    log(`    Overall: ${totalW}-${totalG-totalW} (${pct(totalW,totalG)})`);

    if (totalPoss > 0) {
      const p2=outcomes['2pt'],p3=outcomes['3pt'],pA=outcomes.and1,pM=outcomes.miss,pT=outcomes.turnover;
      const pts = p2*2+p3*3+pA;
      log(`\n  Possession Outcomes (${totalPoss} possessions):`);
      log(`    2PT: ${pct(p2,totalPoss)} | 3PT: ${pct(p3,totalPoss)} | AND1: ${pct(pA,totalPoss)} | Miss: ${pct(pM,totalPoss)} | TO: ${pct(pT,totalPoss)}`);
      log(`    PPP: ${(pts/totalPoss).toFixed(3)} | eFG%: ${pct(p2+p3*1.5+pA, p2+p3+pA+pM)}`);
    }
    if (possPerGame.length) log(`    Poss/Game: Avg ${mean(possPerGame).toFixed(0)} (${Math.min(...possPerGame)}–${Math.max(...possPerGame)})`);
    log(`    OT Games: ${otGames}/${allGames.length} (${pct(otGames,allGames.length)}) — ${otPeriods} total OT periods`);

    // BALANCE
    log('\n\n⚖️ BALANCE ANALYSIS');
    log('─'.repeat(65));
    let homeW=0, awayW=0;
    const homeS: number[]=[],awayS: number[]=[];
    let higherOvrW=0,lowerOvrW=0;
    const ovrDiffs: number[]=[],scoreMargins: number[]=[];
    const synCounts: Record<string,number> = {};
    const playCounts: Record<string,{full:number,partial:number,none:number}> = {};
    let teamApp = 0;

    allGames.forEach(({ result }: any) => {
      const [h,a] = result.finalScore||[0,0];
      homeS.push(h);awayS.push(a);
      if (h>a) homeW++; else awayW++;
      const getOvr = (team: any) => {
        if (!team?.players?.length) return 75;
        return mean(team.players.map((p: any) => p.ratings?.overall||70));
      };
      const ho=getOvr(result.homeTeam),ao=getOvr(result.awayTeam);
      const diff=ho-ao;
      ovrDiffs.push(diff);scoreMargins.push(h-a);
      if (Math.abs(diff)>=0.5) {
        if ((diff>0 && h>a)||(diff<0 && a>h)) higherOvrW++; else lowerOvrW++;
      }
      teamApp+=2;
      [result.homeBonuses,result.awayBonuses].forEach((b: any) => {
        if (!b) return;
        (b.activeSynergies||[]).forEach((s: any) => { synCounts[s.name]=(synCounts[s.name]||0)+1; });
        (b.activePlays||[]).forEach((p: any) => {
          if (!playCounts[p.name]) playCounts[p.name]={full:0,partial:0,none:0};
          const st = p.activated||'none';
          if (st in playCounts[p.name]) (playCounts[p.name] as any)[st]++;
        });
      });
    });

    log(`  Home/Away: Home ${homeW}-${awayW} (${pct(homeW,homeW+awayW)}) | Home Avg: ${mean(homeS).toFixed(1)} | Away Avg: ${mean(awayS).toFixed(1)}`);
    const decided=higherOvrW+lowerOvrW;
    if (decided>0) {
      log(`  OVR → Wins: Higher OVR won ${pct(higherOvrW,decided)} | Upsets ${pct(lowerOvrW,decided)} | r=${corr(ovrDiffs,scoreMargins).toFixed(3)}`);
    }

    if (Object.keys(synCounts).length) {
      log(`\n  Synergy Activation (${teamApp} team appearances):`);
      Object.entries(synCounts).sort((a,b)=>b[1]-a[1]).forEach(([name,count]) => {
        log(`    ${name.padEnd(22)}: ${String(count).padStart(3)} (${pct(count,teamApp)})`);
      });
    }
    if (Object.keys(playCounts).length) {
      log('\n  Play Effect Activation:');
      Object.entries(playCounts).forEach(([name,c]) => {
        const t=c.full+c.partial+c.none;
        log(`    ${name.padEnd(22)}: Full ${c.full} (${pct(c.full,t)}) | Partial ${c.partial} (${pct(c.partial,t)}) | None ${c.none} (${pct(c.none,t)})`);
      });
    }
  }

  log('\n' + '═'.repeat(65));
  log('Analysis Complete.');
  log('═'.repeat(65));
  return lines;
}

export default function DebugPage() {
  const [output, setOutput] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [rawSizes, setRawSizes] = useState<{sessions: number, seasons: number, rosters: number}>({sessions:0,seasons:0,rosters:0});
  const [savedFiles, setSavedFiles] = useState<any[]>([]);

  const saveToDisk = useCallback(async () => {
    setSaveStatus('Saving...');
    try {
      const data = loadData();
      const resp = await fetch('/api/game-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (result.success) {
        setSaveStatus(`✅ Saved ${result.filesWritten.length} files to ${result.directory}`);
        loadSavedFiles();
      } else {
        setSaveStatus(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      setSaveStatus(`❌ ${err.message}`);
    }
  }, []);

  const loadSavedFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/game-logs');
      const result = await resp.json();
      setSavedFiles(result.files || []);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const data = loadData();
      const sessionsStr = localStorage.getItem('hoops-draft-sessions') || '[]';
      const seasonsStr = localStorage.getItem('hoops-draft-seasons') || '[]';
      const rostersStr = localStorage.getItem('myRosters') || '[]';
      setRawSizes({
        sessions: new Blob([sessionsStr]).size,
        seasons: new Blob([seasonsStr]).size,
        rosters: new Blob([rostersStr]).size,
      });
      setOutput(analyzeData(data));
    } catch (err: any) {
      setOutput([`Error: ${err.message}`]);
    }
    loadSavedFiles();
  }, [loadSavedFiles]);

  const totalKB = ((rawSizes.sessions + rawSizes.seasons + rawSizes.rosters) / 1024).toFixed(1);

  return (
    <div className="min-h-screen bg-stone-900 text-stone-200 p-6 font-mono text-sm">
      <h1 className="text-2xl font-bold text-white mb-2">🏀 Game Data Analytics & Logs</h1>
      
      {/* Data Size & Actions */}
      <div className="bg-stone-800 rounded-lg p-4 mb-6 border border-stone-700">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-stone-400 text-xs uppercase tracking-widest mb-1">localStorage Usage</div>
            <div className="text-white">
              Draft Sessions: <span className="text-yellow-400">{(rawSizes.sessions/1024).toFixed(1)} KB</span>
              {' · '}Seasons: <span className="text-yellow-400">{(rawSizes.seasons/1024).toFixed(1)} KB</span>
              {' · '}Rosters: <span className="text-yellow-400">{(rawSizes.rosters/1024).toFixed(1)} KB</span>
              {' · '}Total: <span className="text-orange-400 font-bold">{totalKB} KB</span>
              <span className="text-stone-500"> / ~5,000 KB limit</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveToDisk} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-500 text-xs uppercase tracking-wider">
              💾 Save Full Logs to Disk
            </button>
          </div>
        </div>
        {saveStatus && <div className="mt-2 text-sm">{saveStatus}</div>}
      </div>

      {/* Saved files on disk */}
      {savedFiles.length > 0 && (
        <div className="bg-stone-800 rounded-lg p-4 mb-6 border border-stone-700">
          <div className="text-stone-400 text-xs uppercase tracking-widest mb-2">📂 Saved Log Files (data/game_logs/)</div>
          <div className="space-y-1">
            {savedFiles.map((f: any) => (
              <div key={f.name} className="flex items-center justify-between text-xs">
                <span className="text-blue-400">{f.name}</span>
                <span className="text-stone-500">{f.sizeKB} · {new Date(f.modified).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Output */}
      <div className="bg-stone-950 rounded-lg p-4 border border-stone-800">
        <pre className="whitespace-pre-wrap text-green-400 leading-relaxed">
          {output.join('\n')}
        </pre>
      </div>
    </div>
  );
}
