import re

with open('src/lib/engine.ts', 'r', encoding='utf-8') as f:
    code = f.read()

new_get_all_cards = """
export function getAllCards(): PlayerCard[] {
  const players = db.prepare('SELECT * FROM Player').all() as PlayerBio[];
  const cards: PlayerCard[] = [];
  
  // Categorize positions for pools
  const getPool = (pos: string) => {
      if (pos.includes('SF') || pos.includes('G-F') || pos.includes('F-G')) return 'Wings';
      if (pos.includes('PF') || pos.includes('C') || pos.includes('F-C') || pos.includes('C-F') || pos === 'F') return 'Bigs';
      return 'Guards'; // PG, SG, G
  };

  const rawScores = players.map(p => {
    const stat = db.prepare('SELECT * FROM SeasonStat WHERE playerId = ? ORDER BY season DESC LIMIT 1').get(p.id) as SeasonStat;
    const awardsRows = db.prepare('SELECT * FROM Award WHERE playerId = ?').all(p.id) as {name: string, level: number}[];
    if (!stat) return null;
    
    // Playmaking & Defense & Rebounding (same as before)
    const playmakingRaw = (stat.ast * 8.0) + (stat.ast / (Math.max(0.1, stat.tov)));
    const reboundingRaw = (stat.trb * 8.0);
    const perimDefRaw = (stat.stl * 15.0) + (stat.dbpm * 5.0);
    const postDefRaw = (stat.blk * 15.0) + (stat.dbpm * 5.0);
    
    // NEW DISTANCE OFFENSIVE STATS
    const vol = stat.fga;
    const finVol = vol * stat.pct_fga_0_3;
    const finRaw = (finVol * 2.0) + (finVol * stat.fg_pct_0_3 * 10.0);
    
    const midVol = vol * (stat.pct_fga_3_10 + stat.pct_fga_10_16);
    const midEff = (stat.fg_pct_3_10 + stat.fg_pct_10_16) / 2.0; // approximation
    const midRaw = (midVol * 2.0) + (midVol * midEff * 10.0);
    
    const perVol = vol * (stat.pct_fga_16_3p + stat.pct_fga_3p);
    const perEff = (stat.fg_pct_16_3p + stat.fg_pct_3p) / 2.0;
    const perRaw = (perVol * 3.0) + (perVol * perEff * 10.0) + (stat.fg3_pct * 15.0); // extra boost for pure 3P%
    
    return {
      player: p,
      stat,
      awards: awardsRows,
      pool: getPool(p.position),
      raw: { finRaw, midRaw, perRaw, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm }
    };
  }).filter(Boolean);
  
  // Calculate percentiles against specific pools
  const getPct = (val: number, arr: number[]) => {
    const sorted = [...arr].sort((a,b) => a - b);
    let count = 0;
    for (const x of sorted) {
      if (x <= val) count++;
    }
    return count / Math.max(1, arr.length);
  };
  
  // Create benchmark pools
  const pools: Record<string, any> = {
      'Guards': { fin: [], mid: [], per: [], play: [], reb: [], perim: [], post: [], per_stat: [], vorp_stat: [], dbpm_stat: [] },
      'Wings': { fin: [], mid: [], per: [], play: [], reb: [], perim: [], post: [], per_stat: [], vorp_stat: [], dbpm_stat: [] },
      'Bigs': { fin: [], mid: [], per: [], play: [], reb: [], perim: [], post: [], per_stat: [], vorp_stat: [], dbpm_stat: [] }
  };
  
  for (const r of rawScores) {
      const p = pools[r.pool];
      p.fin.push(r.raw.finRaw);
      p.mid.push(r.raw.midRaw);
      p.per.push(r.raw.perRaw);
      p.play.push(r.raw.playmakingRaw);
      p.reb.push(r.raw.reboundingRaw);
      p.perim.push(r.raw.perimDefRaw);
      p.post.push(r.raw.postDefRaw);
      p.per_stat.push(r.raw.per);
      p.vorp_stat.push(r.raw.vorp);
      p.dbpm_stat.push(r.raw.dbpm);
  }

  for (const r of rawScores) {
    const p = r.player;
    const stat = r.stat;
    const pool = pools[r.pool];
    
    const scale = (pct: number) => Math.round(40 + Math.pow(pct, 1.5) * 59.0);
    
    const finishing = scale(getPct(r.raw.finRaw, pool.fin));
    const midRange = scale(getPct(r.raw.midRaw, pool.mid));
    const perimeter = scale(getPct(r.raw.perRaw, pool.per));
    
    const playmaking = scale(getPct(r.raw.playmakingRaw, pool.play));
    const rebounding = scale(getPct(r.raw.reboundingRaw, pool.reb));
    let perimeterDefense = scale(getPct(r.raw.perimDefRaw, pool.perim));
    let postDefense = scale(getPct(r.raw.postDefRaw, pool.post));
    
    const isAllDef = r.awards.some((a: any) => a.name === 'All-Defensive');
    if (isAllDef) {
        const defTeam = r.awards.find((a: any) => a.name === 'All-Defensive').level;
        const floor = defTeam === 1 ? 96 : 90;
        if (perimeterDefense >= postDefense) perimeterDefense = Math.max(perimeterDefense, floor);
        else postDefense = Math.max(postDefense, floor);
    }
    
    // NEW OVR WEIGHTS (Finishing, Mid, Per, Play, Reb, Def)
    let wFin = 0.1, wMid = 0.1, wPer = 0.1, wPlay = 0.1, wReb = 0.1, wDef = 0.1;
    if (r.pool === 'Guards') {
        wFin = 0.15; wMid = 0.15; wPer = 0.25; wPlay = 0.25; wReb = 0.05; wDef = 0.15;
    } else if (r.pool === 'Wings') {
        wFin = 0.15; wMid = 0.15; wPer = 0.20; wPlay = 0.15; wReb = 0.15; wDef = 0.20;
    } else { // Bigs
        wFin = 0.25; wMid = 0.15; wPer = 0.05; wPlay = 0.05; wReb = 0.25; wDef = 0.25;
    }
    
    // Combine defense for OVR weight
    const combinedDef = (perimeterDefense * 0.6) + (postDefense * 0.4); // generic combo
    
    const baseOvr = (finishing * wFin) + (midRange * wMid) + (perimeter * wPer) + (playmaking * wPlay) + (rebounding * wReb) + (combinedDef * wDef);
    
    // Advanced Stats Multiplier (NO TS%)
    const advancedPct = (getPct(stat.per, pool.per_stat) + getPct(stat.vorp, pool.vorp_stat) + getPct(stat.dbpm, pool.dbpm_stat)) / 3.0;
    const multiplier = 0.8 + (advancedPct * 0.4); 
    
    let overall = Math.round(baseOvr * multiplier);
    overall = Math.max(40, Math.min(99, overall));
    
    let rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic' = 'Common';
    if (overall >= 90) rarity = 'Mythic';
    else if (overall >= 80) rarity = 'Rare';
    else if (overall >= 65) rarity = 'Uncommon';
    
    // Awards Bump-Up
    const hasMvp = r.awards.some((a: any) => a.name === 'MVP');
    const hasAllNba1 = r.awards.some((a: any) => a.name === 'All-NBA' && a.level === 1);
    const hasAllNba = r.awards.some((a: any) => a.name === 'All-NBA');
    const hasDpoy = r.awards.some((a: any) => a.name === 'DPOY');
    const hasAllDef = r.awards.some((a: any) => a.name === 'All-Defensive');
    
    if ((hasMvp || hasAllNba1) && rarity !== 'Mythic') rarity = 'Mythic';
    else if ((hasAllNba || hasDpoy) && rarity !== 'Mythic' && rarity !== 'Rare') rarity = 'Rare';
    else if (hasAllDef && rarity === 'Common') rarity = 'Uncommon';
    
    let traits: Trait[] = [];
    let b;
    b = getBadge(finishing, "Finisher"); if (b) traits.push(b);
    b = getBadge(midRange, "Mid-Range Maestro"); if (b) traits.push(b);
    b = getBadge(perimeter, "Sharpshooter"); if (b) traits.push(b);
    b = getBadge(playmaking, "Floor General"); if (b) traits.push(b);
    b = getBadge(rebounding, "Glass Cleaner"); if (b) traits.push(b);
    b = getBadge(perimeterDefense, "Lockdown Defender"); if (b) traits.push(b);
    b = getBadge(postDefense, "Paint Protector"); if (b) traits.push(b);
    
    // 10 Special Skills
    if (stat.gp >= 75 && stat.mpg >= 34.0) traits.push({ name: "Ironman", level: 3 });
    if (stat.ts >= 0.65 && stat.fga >= 10.0) traits.push({ name: "Efficiency Savant", level: 3 });
    if (stat.ast >= 6.0 && (stat.ast / Math.max(0.1, stat.tov)) >= 3.0) traits.push({ name: "Playmaking Maestro", level: 2 });
    if (p.age <= 21 && overall >= 80) traits.push({ name: "Young Phenom", level: 2 });
    if (p.age >= 33 && stat.vorp >= 2.0) traits.push({ name: "Veteran Presence", level: 2 });
    if (stat.mpg <= 25 && stat.pts >= 15) traits.push({ name: "Microwave", level: 2 });
    if (stat.stl >= 1.0 && stat.blk >= 1.0) traits.push({ name: "Two-Way Disruptor", level: 2 });
    if (stat.fg3_pct >= 0.40 && stat.fg3a >= 6.0) traits.push({ name: "Sniper", level: 2 });
    if (stat.fga >= 20 && stat.pts >= 25) traits.push({ name: "Volume Scorer", level: 3 });
    if (stat.pts >= 15 && stat.trb >= 7 && stat.ast >= 5) traits.push({ name: "Stat Sheet Stuffer", level: 3 });
    
    // Format awards
    const formattedAwards: string[] = [];
    for (const a of r.awards) {
        if (a.name === 'All-NBA' || a.name === 'All-Defensive') {
            const suffix = a.level === 1 ? '1st' : a.level === 2 ? '2nd' : '3rd';
            formattedAwards.push(`${a.name} ${suffix} Team`);
        } else {
            formattedAwards.push(a.name);
        }
    }
    
    cards.push({
      id: p.id,
      player: p,
      stats: stat,
      awards: formattedAwards,
      ratings: { overall, finishing, midRange, perimeter, playmaking, rebounding, perimeterDefense, postDefense } as any,
      traits,
      rarity
    });
  }
  
  return cards;
}
"""

code = re.sub(r'export function getAllCards\(\): PlayerCard\[\] \{[\s\S]*\}\n', new_get_all_cards, code)

with open('src/lib/engine.ts', 'w', encoding='utf-8') as f:
    f.write(code)
print("Rewrote engine.ts successfully")
