#!/usr/bin/env node
/**
 * NBA Card Game — Comprehensive Analysis Script
 * 
 * Reads game logs from data/game_logs/ and produces a full analytics report.
 * 
 * Usage:
 *   node tests/analyze_game_data.js                    # auto-discover latest dump
 *   node tests/analyze_game_data.js data/game_logs/full_dump_*.json  # specific file
 * 
 * Output:
 *   - Terminal report (colored)
 *   - data/game_logs/analysis_report.md (plain markdown)
 */

const fs = require('fs');
const path = require('path');

// ── Helpers ──────────────────────────────────────────────────────────────────

const mean = arr => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const stdDev = arr => { if (arr.length<=1) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length); };
const pct = (n,d) => d ? ((n/d)*100).toFixed(1)+'%' : '—';
const pctNum = (n,d) => d ? (n/d)*100 : 0;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const bar = (val, max, width=20) => { const filled = Math.round((val/Math.max(max,1))*width); return '█'.repeat(filled) + '░'.repeat(width-filled); };
const corr = (x, y) => {
  if (x.length !== y.length || x.length < 2) return 0;
  const mx=mean(x), my=mean(y); let num=0,d1=0,d2=0;
  for (let i=0;i<x.length;i++){const dx=x[i]-mx,dy=y[i]-my;num+=dx*dy;d1+=dx*dx;d2+=dy*dy;}
  const d=Math.sqrt(d1*d2); return d===0?0:num/d;
};

// ── Data Loading ─────────────────────────────────────────────────────────────

function loadData() {
  const logsDir = path.resolve(__dirname, '..', 'data', 'game_logs');
  const specificFile = process.argv[2];

  if (specificFile && fs.existsSync(specificFile)) {
    const data = JSON.parse(fs.readFileSync(specificFile, 'utf-8'));
    return normalizeData(data, specificFile);
  }

  if (!fs.existsSync(logsDir)) {
    console.error(`No game_logs directory found at ${logsDir}`);
    console.error('Export data from http://localhost:3000/debug first.');
    process.exit(1);
  }

  // Try full dump first
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.json')).sort();
  const dumpFile = files.filter(f => f.startsWith('full_dump_')).pop();
  
  if (dumpFile) {
    const data = JSON.parse(fs.readFileSync(path.join(logsDir, dumpFile), 'utf-8'));
    return normalizeData(data, dumpFile);
  }

  // Fall back to individual files
  const sessions = files.filter(f => f.startsWith('draft_')).map(f => JSON.parse(fs.readFileSync(path.join(logsDir, f), 'utf-8')));
  const seasons = files.filter(f => f.startsWith('season_')).map(f => JSON.parse(fs.readFileSync(path.join(logsDir, f), 'utf-8')));
  return { sessions, seasons, source: 'individual files' };
}

function normalizeData(data, source) {
  return {
    sessions: data.sessions || (data.seats ? [data] : []),
    seasons: data.seasons || (data.schedule ? [data] : []),
    rosters: data.rosters || [],
    source,
  };
}

// ── Report Builder ───────────────────────────────────────────────────────────

const reportLines = [];
const flags = [];  // Balance flags: { severity: 'info'|'warn'|'critical', msg }

function log(s = '') { reportLines.push(s); }
function flag(severity, msg) { flags.push({ severity, msg }); }
function section(title) { log(''); log('─'.repeat(70)); log(`  ${title}`); log('─'.repeat(70)); }
function header(title) { log(''); log('═'.repeat(70)); log(`  ${title}`); log('═'.repeat(70)); }

// ── Analysis Functions ───────────────────────────────────────────────────────

function analyzeDraftIntegrity(sessions) {
  section('1. DRAFT INTEGRITY');
  
  sessions.forEach((session, sIdx) => {
    log(`\n  Session #${sIdx+1}: ${session.id}`);
    const seats = session.seats || [];
    const pickLog = session.pickLog || [];
    const allCards = seats.flatMap(s => s.drafted || []);
    const players = allCards.filter(c => c.type === 'Player');
    const plays = allCards.filter(c => c.type === 'Play');

    // Cube uniqueness
    const playerIds = players.map(p => p.id);
    const uniqueIds = new Set(playerIds);
    const dupes = playerIds.length - uniqueIds.size;
    log(`    Total cards: ${allCards.length} (${players.length} players, ${plays.length} plays)`);
    log(`    Cube uniqueness: ${uniqueIds.size}/${players.length} unique ${dupes === 0 ? '✓' : `!! ${dupes} DUPLICATES`}`);
    if (dupes > 0) {
      flag('critical', `Session ${sIdx+1}: ${dupes} duplicate player cards in cube pool`);
      const counts = {};
      playerIds.forEach(id => counts[id] = (counts[id]||0)+1);
      const dupList = Object.entries(counts).filter(([,c]) => c > 1).slice(0,5);
      dupList.forEach(([id,c]) => {
        const card = players.find(p => p.id === id);
        log(`      ${card?.player?.name || id}: appears ${c}x`);
      });
    }

    // Rarity distribution
    const rarity = { Mythic: 0, Rare: 0, Uncommon: 0, Common: 0 };
    players.forEach(c => { if (rarity[c.rarity] !== undefined) rarity[c.rarity]++; });
    const totalPacks = 24;
    log(`\n    Rarity distribution (${players.length} player cards across ${totalPacks} packs):`);
    for (const [r, count] of Object.entries(rarity)) {
      const perPack = (count / totalPacks).toFixed(2);
      const perSeat = (count / 8).toFixed(1);
      log(`      ${pad(r, 10)}: ${padL(count,3)} total | ${padL(perPack,5)}/pack | ${padL(perSeat,4)}/seat | ${bar(count, players.length)}`);
    }
    
    // Mythic density check
    const mythicPerSeat = rarity.Mythic / 8;
    if (mythicPerSeat > 5) flag('warn', `High Mythic density: ${mythicPerSeat.toFixed(1)} per seat — may reduce drafting tension`);
    if (mythicPerSeat < 1.5) flag('info', `Low Mythic density: ${mythicPerSeat.toFixed(1)} per seat — Mythics feel special`);

    // Play rarity
    const playRarity = { Mythic: 0, Rare: 0, Uncommon: 0, Common: 0 };
    plays.forEach(c => { if (playRarity[c.rarity] !== undefined) playRarity[c.rarity]++; });
    log(`\n    Play card rarity (${plays.length} plays):`);
    for (const [r, count] of Object.entries(playRarity)) {
      log(`      ${pad(r, 10)}: ${padL(count,3)}`);
    }

    // Position coverage per seat
    const POS = ['PG','SG','SF','PF','C'];
    log(`\n    Position coverage per seat:`);
    let allCovered = 0;
    seats.forEach((seat, idx) => {
      const dc = seat.builtRoster?.depthChart || {};
      const counts = POS.map(p => (dc[p]||[]).length);
      const hasFull = counts.every(c => c >= 1);
      if (hasFull) allCovered++;
      const label = idx === 0 ? 'You' : (seat.botProfile?.name || seat.id);
      log(`      ${pad(label, 16)}: ${POS.map((p,i) => `${p}:${counts[i]}`).join('  ')} ${hasFull ? '✓' : '!! MISSING'}`);
    });
    if (allCovered < 8) flag('warn', `Only ${allCovered}/8 seats have full position coverage`);
  });
}

function analyzeDraftStrategy(sessions) {
  section('2. DRAFT STRATEGY');
  
  sessions.forEach((session, sIdx) => {
    log(`\n  Session #${sIdx+1}:`);
    const seats = session.seats || [];
    const pickLog = session.pickLog || [];
    const allCards = seats.flatMap(s => s.drafted || []);

    // OVR by pick number
    if (pickLog.length > 0) {
      const ovrByPick = {};
      for (let p = 1; p <= 12; p++) ovrByPick[p] = [];
      pickLog.forEach(rec => {
        const card = allCards.find(c => c.id === rec.pickedCardId);
        if (card?.type === 'Player' && card.ratings?.overall && ovrByPick[rec.pickNumber]) {
          ovrByPick[rec.pickNumber].push(card.ratings.overall);
        }
      });
      
      log('    Value Curve (Avg OVR by pick # within pack):');
      let maxOvr = 0;
      for (let p = 1; p <= 12; p++) maxOvr = Math.max(maxOvr, ovrByPick[p].length ? mean(ovrByPick[p]) : 0);
      for (let p = 1; p <= 12; p++) {
        const ovrs = ovrByPick[p];
        const avg = ovrs.length ? mean(ovrs) : 0;
        log(`      Pick #${padL(p,2)}: ${padL(avg.toFixed(1),5)} ${bar(avg, maxOvr, 25)}`);
      }
      const early = mean([1,2,3,4].flatMap(p => ovrByPick[p]));
      const late = mean([9,10,11,12].flatMap(p => ovrByPick[p]));
      const gradient = early - late;
      log(`      Early(1-4): ${early.toFixed(1)} → Late(9-12): ${late.toFixed(1)} | Gap: ${gradient.toFixed(1)}`);
      if (gradient < 2) flag('warn', `Flat value curve (gap ${gradient.toFixed(1)}) — bots may not be prioritizing well`);
      if (gradient > 12) flag('info', `Steep value curve (gap ${gradient.toFixed(1)}) — clear strategic picks`);
    }

    // Seat OVR comparison (who drafted best?)
    log('\n    Team Strength by Seat (avg OVR of all drafted players):');
    const seatOvrs = seats.map((seat, idx) => {
      const players = (seat.drafted || []).filter(c => c.type === 'Player');
      const ovrs = players.map(p => p.ratings?.overall || 0).filter(o => o > 0);
      const avg = mean(ovrs);
      const top5 = [...ovrs].sort((a,b) => b-a).slice(0, 5);
      return { idx, name: idx === 0 ? 'You' : (seat.botProfile?.name || seat.id), avg, top5Avg: mean(top5), count: players.length };
    }).sort((a,b) => b.avg - a.avg);

    const maxAvg = seatOvrs[0]?.avg || 1;
    seatOvrs.forEach((s, rank) => {
      log(`      #${rank+1} ${pad(s.name, 16)}: avg ${padL(s.avg.toFixed(1),5)} | top5 ${padL(s.top5Avg.toFixed(1),5)} | ${s.count} cards ${bar(s.avg, maxAvg, 20)}`);
    });
    
    const ovrRange = seatOvrs[0].avg - seatOvrs[seatOvrs.length-1].avg;
    if (ovrRange > 6) flag('warn', `Large OVR gap between best/worst drafter: ${ovrRange.toFixed(1)} — draft might be too swingy`);
    if (ovrRange < 2) flag('info', `Tight OVR range (${ovrRange.toFixed(1)}) — draft is well balanced`);

    // R1P1 picks
    if (pickLog.length) {
      const r1p1 = pickLog.filter(p => p.packNumber===1 && p.pickNumber===1);
      log('\n    Round 1, Pick 1 (who picked what):');
      r1p1.forEach(p => {
        const card = allCards.find(c => c.id === p.pickedCardId);
        const name = card?.player?.name || card?.name || p.pickedCardId;
        const ovr = card?.ratings?.overall || '';
        const rarity = card?.rarity || '';
        log(`      ${pad(p.seatId, 10)}: ${pad(name, 22)} ${rarity} ${ovr ? ovr + ' OVR' : ''}`);
      });
    }
  });
}

function analyzeRosters(sessions) {
  section('3. ROSTER COMPARISON');
  
  sessions.forEach((session, sIdx) => {
    log(`\n  Session #${sIdx+1}:`);
    const seats = session.seats || [];
    const POS = ['PG','SG','SF','PF','C'];

    seats.forEach((seat, idx) => {
      const label = idx === 0 ? 'You' : (seat.botProfile?.name || seat.id);
      const dc = seat.builtRoster?.depthChart || {};
      const allDrafted = (seat.drafted || []).filter(c => c.type === 'Player');
      const playerMap = new Map(allDrafted.map(p => [p.id, p]));
      
      // Starters
      const starters = POS.map(pos => {
        const ids = dc[pos] || [];
        return ids[0] ? playerMap.get(ids[0]) : null;
      }).filter(Boolean);
      const starterOvr = mean(starters.map(p => p.ratings?.overall || 0));
      
      // Active roster (all in depth chart)
      const activeIds = new Set(Object.values(dc).flat());
      const activeOvr = mean([...activeIds].map(id => playerMap.get(id)?.ratings?.overall || 0));
      
      // Synergies (count unique badges)
      const badges = {};
      allDrafted.forEach(p => (p.traits || []).forEach(t => { badges[t.name] = (badges[t.name] || 0) + 1; }));
      const topBadges = Object.entries(badges).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([n,c]) => `${n}×${c}`);
      
      const plays = (seat.drafted || []).filter(c => c.type === 'Play');
      const activePlays = (seat.builtRoster?.activePlays || []).map(id => plays.find(p => p.id === id)?.name || id);
      
      log(`    ${pad(label, 16)}: Starters ${padL(starterOvr.toFixed(1),5)} OVR | Roster ${padL(activeOvr.toFixed(1),5)} OVR | Badges: ${topBadges.join(', ')} | Plays: ${activePlays.join(', ') || 'none'}`);
    });
  });
}

function analyzeScoringRealism(games) {
  section('4. SCORING REALISM');
  
  const teamScores = [], gameTotals = [];
  const qScores = { 1: [], 2: [], 3: [], 4: [] };
  
  games.forEach(({ result }) => {
    const [h,a] = result.finalScore || [0,0];
    teamScores.push(h, a);
    gameTotals.push(h + a);
    (result.quarterSummaries || []).forEach(q => {
      if (q.quarter <= 4) {
        qScores[q.quarter]?.push(q.homeScore, q.awayScore);
      }
    });
  });

  if (!teamScores.length) { log('  No games to analyze.'); return; }
  
  log(`\n  Team Scores (${teamScores.length} team-games):`);
  log(`    Min: ${Math.min(...teamScores)} | Max: ${Math.max(...teamScores)} | Avg: ${mean(teamScores).toFixed(1)} | Median: ${median(teamScores).toFixed(1)} | σ: ±${stdDev(teamScores).toFixed(1)}`);
  
  log(`\n  Game Totals (${gameTotals.length} games):`);
  log(`    Avg: ${mean(gameTotals).toFixed(1)} | Range: ${Math.min(...gameTotals)}–${Math.max(...gameTotals)}`);
  
  // NBA realism bands
  const bands = [
    ['< 80', s => s < 80],
    ['80-89', s => s >= 80 && s < 90],
    ['90-99', s => s >= 90 && s < 100],
    ['100-109', s => s >= 100 && s < 110],
    ['110-119', s => s >= 110 && s < 120],
    ['120-130', s => s >= 120 && s <= 130],
    ['> 130', s => s > 130],
  ];
  log('\n  Score Distribution:');
  bands.forEach(([label, fn]) => {
    const count = teamScores.filter(fn).length;
    log(`    ${pad(label, 8)}: ${padL(count, 3)} (${padL(pct(count, teamScores.length), 6)}) ${bar(count, teamScores.length, 25)}`);
  });
  
  const realistic = teamScores.filter(s => s >= 90 && s <= 130).length;
  const realPct = pctNum(realistic, teamScores.length);
  if (realPct >= 70) log('    Verdict: ✓ NBA-realistic');
  else { log('    Verdict: !! Needs calibration'); flag('warn', `Only ${realPct.toFixed(0)}% of scores fall in NBA range [90-130]`); }
  
  // Quarter scoring patterns
  if (Object.values(qScores).some(arr => arr.length > 0)) {
    log('\n  Quarter Scoring (avg per team):');
    for (let q = 1; q <= 4; q++) {
      const arr = qScores[q] || [];
      if (arr.length) log(`    Q${q}: ${mean(arr).toFixed(1)} pts ${bar(mean(arr), 35, 20)}`);
    }
  }
}

function analyzeCompetitiveness(games) {
  section('5. COMPETITIVENESS');
  
  const margins = games.map(({ result }) => Math.abs((result.finalScore||[0,0])[0] - (result.finalScore||[0,0])[1]));
  if (!margins.length) { log('  No games.'); return; }
  
  log(`\n  Margin of Victory: Avg ${mean(margins).toFixed(1)} | Median ${median(margins).toFixed(1)} | Max ${Math.max(...margins)}`);
  
  const bands = [
    ['Buzzer (1-3)', m => m >= 1 && m <= 3],
    ['Close (4-7)', m => m >= 4 && m <= 7],
    ['Moderate (8-14)', m => m >= 8 && m <= 14],
    ['Blowout (15-24)', m => m >= 15 && m <= 24],
    ['Blowout (25+)', m => m >= 25],
  ];
  log('  Distribution:');
  bands.forEach(([label, fn]) => {
    const count = margins.filter(fn).length;
    log(`    ${pad(label, 18)}: ${padL(count, 2)} (${padL(pct(count, margins.length), 6)}) ${bar(count, margins.length, 20)}`);
  });
  
  const closeRate = pctNum(margins.filter(m => m <= 7).length, margins.length);
  if (closeRate < 20) flag('warn', `Low close-game rate (${closeRate.toFixed(0)}%) — games may be too decided by roster strength`);
  if (closeRate > 60) flag('info', `High close-game rate (${closeRate.toFixed(0)}%) — lots of competitive games`);

  // H2H
  const botH2H = {};
  games.forEach(({ result }) => {
    const [h,a] = result.finalScore || [0,0];
    const homeIsH = result.homeTeam?.seatId === 'human-0';
    const awayIsH = result.awayTeam?.seatId === 'human-0';
    if (!homeIsH && !awayIsH) return;
    const won = homeIsH ? h>a : a>h;
    const opp = homeIsH ? result.awayTeam : result.homeTeam;
    const name = opp?.name || opp?.seatId || '?';
    if (!botH2H[name]) botH2H[name] = {w:0,l:0,pf:0,pa:0,margins:[]};
    botH2H[name][won?'w':'l']++;
    botH2H[name].pf += homeIsH?h:a;
    botH2H[name].pa += homeIsH?a:h;
    botH2H[name].margins.push((homeIsH?h:a) - (homeIsH?a:h));
  });
  
  log('\n  Human vs Bots:');
  let totalW=0, totalG=0;
  Object.entries(botH2H).forEach(([name,rec]) => {
    totalW+=rec.w; totalG+=rec.w+rec.l;
    const avgMargin = mean(rec.margins);
    log(`    vs ${pad(name,18)}: ${rec.w}-${rec.l}  Pts ${rec.pf}-${rec.pa} (avg margin ${avgMargin>=0?'+':''}${avgMargin.toFixed(1)})`);
  });
  log(`    Overall: ${totalW}-${totalG-totalW} (${pct(totalW,totalG)})`);
}

function analyzePossessions(games) {
  section('6. POSSESSION ENGINE');
  
  const outcomes = { '2pt':0, '3pt':0, and1:0, turnover:0, miss:0 };
  let totalPoss = 0;
  const possPerGame = [];
  
  games.forEach(({ result }) => {
    const poss = result.possessions || [];
    if (poss.length) possPerGame.push(poss.length);
    poss.forEach(p => { totalPoss++; if (outcomes[p.outcome] !== undefined) outcomes[p.outcome]++; });
  });
  
  if (!totalPoss) { log('  No possession data.'); return; }
  
  const p2=outcomes['2pt'], p3=outcomes['3pt'], pA=outcomes.and1, pM=outcomes.miss, pT=outcomes.turnover;
  const scoringPoss = p2+p3+pA;
  const totalPts = p2*2+p3*3+pA;
  
  log(`\n  Total Possessions: ${totalPoss} across ${games.length} games`);
  if (possPerGame.length) log(`  Per Game: Avg ${mean(possPerGame).toFixed(0)} | Range ${Math.min(...possPerGame)}–${Math.max(...possPerGame)}`);
  
  log('\n  Outcome Breakdown:');
  const outcomeData = [
    ['2-Pointers', p2, p2*2],
    ['3-Pointers', p3, p3*3],
    ['And-1s', pA, pA],
    ['Misses', pM, 0],
    ['Turnovers', pT, 0],
  ];
  outcomeData.forEach(([label, count, pts]) => {
    log(`    ${pad(label, 12)}: ${padL(count,4)} (${padL(pct(count,totalPoss),6)}) ${pts > 0 ? `→ ${pts} pts (${pct(pts,totalPts)} of scoring)` : ''} ${bar(count, totalPoss, 20)}`);
  });
  
  log(`\n  Efficiency:`);
  log(`    PPP: ${(totalPts/totalPoss).toFixed(3)}`);
  log(`    eFG%: ${pct(p2 + p3*1.5 + pA, scoringPoss+pM)}`);
  log(`    Scoring Rate: ${pct(scoringPoss, totalPoss)} of possessions score`);
  log(`    TO Rate: ${pct(pT, totalPoss)}`);
  
  // NBA benchmarks
  const ppp = totalPts/totalPoss;
  if (ppp < 0.95) flag('warn', `PPP (${ppp.toFixed(3)}) below NBA average (~1.05–1.15) — offense may be too weak`);
  if (ppp > 1.20) flag('warn', `PPP (${ppp.toFixed(3)}) above NBA average — offense may be too strong`);
  const toRate = pctNum(pT, totalPoss);
  if (toRate > 16) flag('warn', `TO rate (${toRate.toFixed(1)}%) above NBA avg (~13%) — turnovers too frequent`);
  if (toRate < 8) flag('warn', `TO rate (${toRate.toFixed(1)}%) below NBA avg — turnovers too rare`);
  const threePtRate = pctNum(p3, p2+p3+pA+pM);
  if (threePtRate > 18) flag('info', `3PT attempt rate (${threePtRate.toFixed(1)}%) — high, modern NBA style`);
}

function analyzeBoxScores(games) {
  section('7. BOX SCORE DEEP DIVE');
  
  // Aggregate individual stats across all games
  const playerStats = {};
  
  games.forEach(({ result }) => {
    ['home', 'away'].forEach(side => {
      const box = result.boxScore?.[side] || [];
      box.forEach(bs => {
        if (!playerStats[bs.playerId]) {
          playerStats[bs.playerId] = { name: bs.playerName, games: 0, totalPts: 0, totalPoss: 0, totalMin: 0, p2: 0, p3: 0, a1: 0, to: 0, ast: 0 };
        }
        const ps = playerStats[bs.playerId];
        ps.games++;
        ps.totalPts += bs.points || 0;
        ps.totalPoss += bs.possessions || 0;
        ps.totalMin += bs.minutes || 0;
        ps.p2 += bs.twoPointers || 0;
        ps.p3 += bs.threePointers || 0;
        ps.a1 += bs.andOnes || 0;
        ps.to += bs.turnovers || 0;
        ps.ast += bs.assists || 0;
      });
    });
  });
  
  const playerList = Object.values(playerStats);
  if (!playerList.length) { log('  No box score data.'); return; }
  
  // Top scorers
  const topScorers = [...playerList].sort((a,b) => (b.totalPts/b.games) - (a.totalPts/a.games)).slice(0, 10);
  log('\n  Top 10 Scorers (avg PPG):');
  topScorers.forEach((p, i) => {
    const ppg = (p.totalPts/p.games).toFixed(1);
    const mpg = (p.totalMin/p.games).toFixed(1);
    const efficiency = p.totalPoss > 0 ? (p.totalPts/p.totalPoss).toFixed(2) : '—';
    log(`    ${padL(i+1,2)}. ${pad(p.name, 22)}: ${padL(ppg,5)} PPG | ${padL(mpg,4)} MPG | ${padL(efficiency,4)} pts/poss | ${p.games} games`);
  });
  
  // Minutes distribution
  const allMinutes = playerList.map(p => p.totalMin/p.games);
  log(`\n  Minutes Distribution: Avg ${mean(allMinutes).toFixed(1)} MPG | Median ${median(allMinutes).toFixed(1)} | Max ${Math.max(...allMinutes).toFixed(1)}`);
  
  const starterLike = playerList.filter(p => p.totalMin/p.games >= 25).length;
  const benchLike = playerList.filter(p => p.totalMin/p.games >= 8 && p.totalMin/p.games < 25).length;
  const dndLike = playerList.filter(p => p.totalMin/p.games < 8).length;
  log(`    Starters (25+ MPG): ${starterLike} | Bench (8-24 MPG): ${benchLike} | DNP (<8 MPG): ${dndLike}`);
}

function analyzeRotations(games) {
  section('8. ROTATION AUDIT');
  
  let totalSubs = 0;
  const subsPerGame = [];
  
  games.forEach(({ result }) => {
    const subs = result.substitutions || [];
    subsPerGame.push(subs.length);
    totalSubs += subs.length;
  });
  
  if (!subsPerGame.length) { log('  No substitution data.'); return; }
  
  log(`\n  Substitutions: ${totalSubs} total across ${games.length} games`);
  log(`  Per Game: Avg ${mean(subsPerGame).toFixed(1)} | Range ${Math.min(...subsPerGame)}–${Math.max(...subsPerGame)}`);
  
  // Check OT uses starters only
  const otGames = games.filter(g => g.result.isOvertime);
  log(`  OT Games: ${otGames.length}/${games.length}`);
}

function analyzeSynergiesAndPlays(games) {
  section('9. SYNERGY & PLAY BALANCE');
  
  const synCounts = {};
  const playCounts = {};
  let teamApps = 0;
  
  games.forEach(({ result }) => {
    teamApps += 2;
    [result.homeBonuses, result.awayBonuses].forEach(b => {
      if (!b) return;
      (b.activeSynergies || []).forEach(s => { synCounts[s.name] = (synCounts[s.name] || 0) + 1; });
      (b.activePlays || []).forEach(p => {
        if (!playCounts[p.name]) playCounts[p.name] = { full:0, partial:0, none:0 };
        const st = p.activated || 'none';
        if (st in playCounts[p.name]) playCounts[p.name][st]++;
      });
    });
  });
  
  if (!teamApps) { log('  No data.'); return; }
  
  // Synergies
  log(`\n  Synergy Activation (${teamApps} team appearances):`);
  const sortedSyn = Object.entries(synCounts).sort((a,b) => b[1] - a[1]);
  sortedSyn.forEach(([name, count]) => {
    const rate = pctNum(count, teamApps);
    let tag = '';
    if (rate >= 80) { tag = ' ← TOO EASY'; flag('warn', `Synergy "${name}" activates ${rate.toFixed(0)}% of the time — trivially easy`); }
    else if (rate >= 50) tag = ' ← COMMON';
    else if (rate <= 10) tag = ' ← RARE';
    log(`    ${pad(name, 22)}: ${padL(count,3)}/${teamApps} (${padL(pct(count,teamApps),6)}) ${bar(count, teamApps, 20)}${tag}`);
  });
  
  // Known synergies not seen at all
  const knownSynergies = [
    'Shooting Gallery', 'Paint Dominance', 'Lockdown Squad', 'Boards Brigade',
    'Court Vision', 'Midrange Money', 'Inside-Out', 'Two-Way Terror',
    'Point God System', 'Rim Protection', 'Two-Way Wings', 'Brotherhood',
    'Veteran Core', 'Young Guns'
  ];
  const neverSeen = knownSynergies.filter(s => !synCounts[s]);
  if (neverSeen.length) {
    log(`\n    Never activated (${neverSeen.length}): ${neverSeen.join(', ')}`);
    if (neverSeen.length > knownSynergies.length * 0.5) {
      flag('warn', `${neverSeen.length}/${knownSynergies.length} synergies never activated — requirements may be too strict or sample too small`);
    }
  }

  // Plays
  if (Object.keys(playCounts).length) {
    log('\n  Play Effect Activation:');
    Object.entries(playCounts).forEach(([name, c]) => {
      const t = c.full + c.partial + c.none;
      const fullRate = pctNum(c.full, t);
      let tag = '';
      if (fullRate >= 80) { tag = ' ← ALWAYS FIRES'; flag('info', `Play "${name}" fully activates ${fullRate.toFixed(0)}%`); }
      if (c.none > 0 && pctNum(c.none, t) >= 80) { tag = ' ← NEVER FIRES'; flag('warn', `Play "${name}" never activates ${pctNum(c.none,t).toFixed(0)}%`); }
      log(`    ${pad(name, 22)}: Full ${padL(c.full,2)} (${padL(pct(c.full,t),6)}) | Partial ${padL(c.partial,2)} (${padL(pct(c.partial,t),6)}) | None ${padL(c.none,2)} (${padL(pct(c.none,t),6)})${tag}`);
    });
  }
}

function analyzeOvrWinCorrelation(games) {
  section('10. OVR → WINNING CORRELATION');
  
  let homeW=0, awayW=0, higherW=0, lowerW=0;
  const ovrDiffs=[], scoreMargins=[];
  const homeS=[], awayS=[];
  
  games.forEach(({ result }) => {
    const [h,a] = result.finalScore || [0,0];
    homeS.push(h); awayS.push(a);
    if (h>a) homeW++; else awayW++;
    
    const getOvr = team => {
      if (!team?.players?.length) return 75;
      return mean(team.players.map(p => p.ratings?.overall || 70));
    };
    const ho = getOvr(result.homeTeam), ao = getOvr(result.awayTeam);
    const diff = ho - ao;
    ovrDiffs.push(diff); scoreMargins.push(h-a);
    if (Math.abs(diff) >= 0.5) {
      if ((diff>0 && h>a) || (diff<0 && a>h)) higherW++; else lowerW++;
    }
  });
  
  if (!games.length) { log('  No data.'); return; }
  
  log(`\n  Home/Away: Home ${homeW}-${awayW} (${pct(homeW, homeW+awayW)})`);
  log(`    Home Avg: ${mean(homeS).toFixed(1)} | Away Avg: ${mean(awayS).toFixed(1)} | Edge: ${(mean(homeS)-mean(awayS)).toFixed(1)} pts`);
  
  const decided = higherW + lowerW;
  if (decided) {
    const hiRate = pctNum(higherW, decided);
    log(`\n  OVR Impact: Higher OVR wins ${pct(higherW, decided)} | Upsets ${pct(lowerW, decided)}`);
    if (hiRate > 85) flag('warn', `Higher OVR wins ${hiRate.toFixed(0)}% — team strength too deterministic, not enough variance`);
    if (hiRate < 55) flag('warn', `Higher OVR wins only ${hiRate.toFixed(0)}% — OVR doesn't matter enough`);
  }
  
  const r = corr(ovrDiffs, scoreMargins);
  log(`  Pearson r (OVR diff → score margin): ${r.toFixed(3)}`);
  if (Math.abs(r) > 0.6) log('    Strong correlation — team quality drives outcomes well');
  else if (Math.abs(r) > 0.3) log('    Moderate correlation — healthy mix of skill and variance');
  else log('    Weak correlation — results feel random relative to team strength');
}

function analyzeSeasonComparison(seasons) {
  section('11. CROSS-SEASON COMPARISON');
  
  if (seasons.length < 1) { log('  No seasons.'); return; }
  
  seasons.forEach((season, sIdx) => {
    log(`\n  Season #${sIdx+1} (${season.id}):`);
    const played = (season.schedule || []).filter(e => e.played);
    const human = season.standings?.find(s => s.seatId === 'human-0');
    
    if (human) {
      log(`    Human Record: ${human.wins}-${human.losses} | PF: ${human.pointsFor} | PA: ${human.pointsAgainst} | Diff: ${human.pointDiff >= 0 ? '+' : ''}${human.pointDiff}`);
    }
    
    // Final standings
    const sorted = [...(season.standings || [])].sort((a,b) => b.wins !== a.wins ? b.wins-a.wins : b.pointDiff-a.pointDiff);
    log('    Standings:');
    sorted.forEach((s, i) => {
      const isHuman = s.seatId === 'human-0';
      log(`      ${i+1}. ${pad(s.name, 18)}: ${s.wins}-${s.losses} (${s.pointDiff >= 0 ? '+' : ''}${s.pointDiff}) ${isHuman ? '← YOU' : ''}`);
    });
  });
}

function printBalanceFlags() {
  header('BALANCE & DESIGN FLAGS');
  
  if (!flags.length) {
    log('  No balance issues detected. ✓');
    return;
  }
  
  const critical = flags.filter(f => f.severity === 'critical');
  const warns = flags.filter(f => f.severity === 'warn');
  const infos = flags.filter(f => f.severity === 'info');
  
  if (critical.length) {
    log('\n  🔴 CRITICAL:');
    critical.forEach(f => log(`    • ${f.msg}`));
  }
  if (warns.length) {
    log('\n  🟡 WARNINGS:');
    warns.forEach(f => log(`    • ${f.msg}`));
  }
  if (infos.length) {
    log('\n  🔵 INFO:');
    infos.forEach(f => log(`    • ${f.msg}`));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const data = loadData();
  const sessions = data.sessions || [];
  const seasons = data.seasons || [];
  
  // Collect all played games
  const allGames = [];
  seasons.forEach(season => {
    (season.schedule || []).forEach((entry, gIdx) => {
      if (entry.played && entry.result) {
        allGames.push({ gameIndex: entry.gameIndex ?? gIdx, result: entry.result, seasonId: season.id });
      }
    });
  });

  header('NBA CARD GAME — COMPREHENSIVE ANALYSIS');
  log(`  Source: ${data.source}`);
  log(`  Draft Sessions: ${sessions.length} | Seasons: ${seasons.length} | Games: ${allGames.length}`);
  log(`  Generated: ${new Date().toISOString()}`);

  analyzeDraftIntegrity(sessions);
  analyzeDraftStrategy(sessions);
  analyzeRosters(sessions);
  analyzeScoringRealism(allGames);
  analyzeCompetitiveness(allGames);
  analyzePossessions(allGames);
  analyzeBoxScores(allGames);
  analyzeRotations(allGames);
  analyzeSynergiesAndPlays(allGames);
  analyzeOvrWinCorrelation(allGames);
  analyzeSeasonComparison(seasons);
  printBalanceFlags();

  log('\n' + '═'.repeat(70));
  log('  Analysis Complete.');
  log('═'.repeat(70));

  // Print to console
  console.log(reportLines.join('\n'));

  // Write markdown report
  const reportDir = path.resolve(__dirname, '..', 'data', 'game_logs');
  if (fs.existsSync(reportDir)) {
    const reportPath = path.join(reportDir, 'analysis_report.md');
    const md = '```\n' + reportLines.join('\n') + '\n```\n';
    fs.writeFileSync(reportPath, md, 'utf-8');
    console.log(`\n📄 Report written to: ${reportPath}`);
  }
}

main();
