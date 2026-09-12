import Database from 'better-sqlite3';
import path from 'path';

export interface PlayerBio {
  id: string;
  name: string;
  position: string;
  height: string;
  weight: number;
  age: number;
  team: string;
}

export interface SeasonStat {
  gp: number;
  mpg: number;
  pts: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fta: number;
  pct_fga_0_3: number;
  pct_fga_3_10: number;
  pct_fga_10_16: number;
  pct_fga_16_3p: number;
  pct_fga_3p: number;
  fg_pct_0_3: number;
  fg_pct_3_10: number;
  fg_pct_10_16: number;
  fg_pct_16_3p: number;
  fg_pct_3p: number;
  fg_pct: number;
  fg3_pct: number;
  fg2_pct: number;
  ft_pct: number;
  per: number;
  ts: number;
  vorp: number;
  dbpm: number;
  tov: number;
}

export interface ComputedRatings {
  overall: number;
  finishing: number;
  midRange: number;
  perimeter: number;
  playmaking: number;
  rebounding: number;
  perimeterDefense: number;
  postDefense: number;
  _baseOvr?: number;
  _multiplier?: number;
}

export interface Trait {
  name: string;
  level: number;
}

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Mythic';

export interface AwardRow {
  name: string;
  level: number | null;
}

export interface PlayerCard {
  id: string;
  player: PlayerBio;
  stats: SeasonStat;
  awards: string[];
  ratings: ComputedRatings;
  traits: Trait[];
  rarity: Rarity;
}

let db: Database.Database | null = null;

function openDatabase(): Database.Database {
  const dbPath = path.join(process.cwd(), 'game.db');
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to open game database at expected path "${dbPath}". ` +
      `Make sure game.db exists (run from the frontend/ directory, or check process.cwd()). ` +
      `Original error: ${reason}`
    );
  }
}

function getDb(): Database.Database {
  if (!db) db = openDatabase();
  return db;
}

let cache: PlayerCard[] | null = null;

export function clearCardCache(): void {
  cache = null;
}

function getBadge(val: number, name: string): Trait | null {
  if (val >= 96) return { name, level: 3 };
  if (val >= 90) return { name, level: 2 };
  if (val >= 80) return { name, level: 1 };
  return null;
}

const LEGENDARY_PLAYERS = new Set([
  "LeBron James", "Stephen Curry", "Kevin Durant", "Kawhi Leonard", 
  "Chris Paul", "Russell Westbrook", "James Harden", "Damian Lillard", 
  "Kyrie Irving", "Paul George", "Jimmy Butler", "Anthony Davis", 
  "Giannis Antetokounmpo", "Nikola Jokic", "Joel Embiid", "Rudy Gobert",
  "Bradley Beal", "CJ McCollum"
]);

export function getAllCards(): PlayerCard[] {
    if (cache) return cache;
    const db = getDb();
    const RATING_CONFIG = {
        benchmarkCutoff: 0.075,
        offense: {
            finVol: 0.35, finEff: 0.45, finFT: 0.20,
            midVol: 0.35, midEff: 0.65,
            perVol: 0.35, perEff: 0.65
        },
        defense: {
            vol: 0.40,
            skill: 0.60
        },
        ovr: {
            TOP1: 10,
            TOP2: 5,
            FORGIVE: 0.5,
            OFFROLE_MAX_W: 7,
            REF: 60,
            CORE_PEN: 1.0,
            CORE_REF: 70,
            PROFILES: {
                'PG':   [15, 10, 20, 30,  6, 14,  5],
                'SG':   [15, 18, 28, 14,  5, 15,  5],
                'SF':   [20, 14, 18, 10, 14, 17,  7],
                'PF':   [24, 13,  9,  5, 20, 11, 18],
                'C':    [24,  8,  4,  5, 29,  7, 23],
                'G':    [15, 14, 24, 22,  5, 15,  5],
                'F':    [22, 13, 13,  7, 17, 14, 14],
                'G/F':  [18, 14, 21, 14, 10, 16,  7],
                'F/C':  [24, 11,  6,  5, 24,  9, 21],
                'Gold': [14, 14, 14, 14, 14, 15, 15]
            } as Record<string, number[]>
        }
    };
    
    const players = db.prepare('SELECT * FROM Player').all() as PlayerBio[];

    const allStats = db.prepare('SELECT * FROM SeasonStat').all() as (SeasonStat & { playerId: string; season: string })[];
    const minDbpm = Math.min(...allStats.map(s => s.dbpm || 0));
    const minVorp = Math.min(...allStats.map(s => s.vorp || 0));

    // Latest season per player: mirrors `ORDER BY season DESC LIMIT 1`, i.e. keep the
    // max `season` string per playerId, preferring the first-encountered row on ties
    // (matches SQLite's stable sort over the original table-scan order).
    const latestStatByPlayer = new Map<string, SeasonStat & { playerId: string; season: string }>();
    for (const s of allStats) {
        const existing = latestStatByPlayer.get(s.playerId);
        if (!existing || s.season > existing.season) {
            latestStatByPlayer.set(s.playerId, s);
        }
    }

    const allAwards = db.prepare('SELECT * FROM Award').all() as (AwardRow & { playerId: string })[];
    const awardsByPlayer = new Map<string, AwardRow[]>();
    for (const a of allAwards) {
        let list = awardsByPlayer.get(a.playerId);
        if (!list) {
            list = [];
            awardsByPlayer.set(a.playerId, list);
        }
        list.push(a);
    }

    const cards: PlayerCard[] = [];
    
    const getPool = (pos: string) => {
        if (pos === 'PG') return 'PG';
        if (pos === 'SG') return 'SG';
        if (pos === 'SF') return 'SF';
        if (pos === 'PF') return 'PF';
        if (pos === 'C') return 'C';
        if (pos === 'G' || pos === 'PG/SG' || pos === 'SG/PG') return 'G';
        if (pos === 'F' || pos === 'SF/PF' || pos === 'PF/SF') return 'F';
        if (pos.includes('G/F') || pos.includes('F/G') || pos.includes('SG/SF') || pos.includes('SF/SG')) return 'G/F';
        if (pos.includes('F/C') || pos.includes('C/F') || pos.includes('PF/C') || pos.includes('C/PF')) return 'F/C';
        return 'Gold'; 
    };

    let maxPts = 0, maxAst = 0, maxTrb = 0, maxStl = 0, maxBlk = 0, max3pm = 0;

    const rawScores = players.map(p => {
        const stat = latestStatByPlayer.get(p.id) as SeasonStat | undefined;
        const awardsRows = awardsByPlayer.get(p.id) || [];
        if (!stat) return null;
        
        // Track max stats for League Leader trait
        if (stat.pts > maxPts) maxPts = stat.pts;
        if (stat.ast > maxAst) maxAst = stat.ast;
        if (stat.trb > maxTrb) maxTrb = stat.trb;
        if (stat.stl > maxStl) maxStl = stat.stl;
        if (stat.blk > maxBlk) maxBlk = stat.blk;
        const fg3m = stat.fg3a * stat.fg3_pct;
        if (fg3m > max3pm) max3pm = fg3m;
        
        const playmakingRaw = (stat.ast * 8.0) + (stat.ast / (Math.max(0.1, stat.tov)));
        const reboundingRaw = (stat.trb * 8.0);
        
        const perimDefRaw = stat.stl || 0;
        const postDefRaw = stat.blk || 0;
        const dbpmNorm = (stat.dbpm || 0) - minDbpm;
        const vorpNorm = (stat.vorp || 0) - minVorp;
        
        const vol = stat.fga;
        const finFGA = vol * stat.pct_fga_0_3;
        const finFGM = finFGA * stat.fg_pct_0_3;
        const finEff = stat.fg_pct_0_3;
        const ftEff = stat.ft_pct || 0;
        
        const midFGA = vol * (stat.pct_fga_3_10 + stat.pct_fga_10_16 + stat.pct_fga_16_3p);
        const midFGM = vol * ((stat.pct_fga_3_10 * stat.fg_pct_3_10) + (stat.pct_fga_10_16 * stat.fg_pct_10_16) + (stat.pct_fga_16_3p * stat.fg_pct_16_3p));
        const midEff = midFGA > 0 ? (midFGM / midFGA) : 0;
        
        const perFGA = vol * stat.pct_fga_3p;
        const perFGM = vol * (stat.pct_fga_3p * stat.fg_pct_3p);
        const perEff = stat.fg_pct_3p || 0;
        
        return {
            player: p,
            stat,
            awards: awardsRows,
            pool: getPool(p.position),
            raw: { finFGA, finFGM, finEff, ftEff, midFGA, midFGM, midEff, perFGA, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, dbpmNorm, vorpNorm, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm, ts: stat.ts }
        };
    }).filter(Boolean);
    
    const globalStats = {
        finFGM: [] as number[], finEff: [] as number[], ftEff: [] as number[],
        midFGM: [] as number[], midEff: [] as number[],
        perFGM: [] as number[], perEff: [] as number[],
        play: [] as number[], reb: [] as number[], perim: [] as number[], post: [] as number[],
        dbpmNorm: [] as number[], per_stat: [] as number[], vorpNorm: [] as number[]
    };
    
    for (const r of rawScores) {
        if (!r) continue;
        globalStats.finFGM.push(r.raw.finFGM);
        if (r.raw.finFGA >= 1.0) globalStats.finEff.push(r.raw.finEff);
        globalStats.ftEff.push(r.raw.ftEff);
        
        globalStats.midFGM.push(r.raw.midFGM);
        if (r.raw.midFGA >= 2.0) globalStats.midEff.push(r.raw.midEff);
        
        globalStats.perFGM.push(r.raw.perFGM);
        if (r.raw.perFGA >= 2.0) globalStats.perEff.push(r.raw.perEff);
        
        globalStats.play.push(r.raw.playmakingRaw);
        globalStats.reb.push(r.raw.reboundingRaw);
        globalStats.perim.push(r.raw.perimDefRaw);
        globalStats.post.push(r.raw.postDefRaw);
        globalStats.dbpmNorm.push(r.raw.dbpmNorm);
        globalStats.per_stat.push(r.raw.per);
        globalStats.vorpNorm.push(r.raw.vorpNorm);
    }
    
    const getBenchmark = (arr: number[]) => {
      const sorted = [...arr].sort((a,b) => b - a);
      const topCount = Math.max(1, Math.floor(arr.length * RATING_CONFIG.benchmarkCutoff));
      let sum = 0;
      for (let i = 0; i < topCount; i++) sum += sorted[i];
      return sum / topCount;
    };
    
    const b_finFGM = getBenchmark(globalStats.finFGM);
    const b_finEff = getBenchmark(globalStats.finEff);
    const b_ftEff = getBenchmark(globalStats.ftEff);
    const b_midFGM = getBenchmark(globalStats.midFGM);
    const b_midEff = getBenchmark(globalStats.midEff);
    const b_perFGM = getBenchmark(globalStats.perFGM);
    const b_perEff = getBenchmark(globalStats.perEff);
    const b_play = getBenchmark(globalStats.play);
    const b_reb = getBenchmark(globalStats.reb);
    const b_perim = getBenchmark(globalStats.perim);
    const b_post = getBenchmark(globalStats.post);
    const b_dbpmNorm = getBenchmark(globalStats.dbpmNorm);
    const b_per_stat = getBenchmark(globalStats.per_stat);
    const b_vorpNorm = getBenchmark(globalStats.vorpNorm);
  
    for (const r of rawScores) {
      if (!r) continue;
      const p = r.player;
      const stat = r.stat;
      
      const getIndex = (val: number, benchmark: number) => {
          if (benchmark <= 0) return 0;
          return Math.min(1.0, val / benchmark);
      };
      
      const scaleRaw = (idx: number) => Math.round(idx * 99.0);
      
      const finVolIdx = getIndex(r.raw.finFGM, b_finFGM);
      const finEffIdx = r.raw.finFGA >= 1.0 ? getIndex(r.raw.finEff, b_finEff) : 0;
      const ftEffIdx = getIndex(r.raw.ftEff, b_ftEff);
      const finishing = scaleRaw((finVolIdx * RATING_CONFIG.offense.finVol) + (finEffIdx * RATING_CONFIG.offense.finEff) + (ftEffIdx * RATING_CONFIG.offense.finFT));
      
      const midVolIdx = getIndex(r.raw.midFGM, b_midFGM);
      const midEffIdx = r.raw.midFGA >= 1.0 ? getIndex(r.raw.midEff, b_midEff) : 0;
      const midRange = scaleRaw((midVolIdx * RATING_CONFIG.offense.midVol) + (midEffIdx * RATING_CONFIG.offense.midEff));
      
      const perVolIdx = getIndex(r.raw.perFGM, b_perFGM);
      const perEffIdx = r.raw.perFGA >= 1.0 ? getIndex(r.raw.perEff, b_perEff) : 0;
      const perimeter = scaleRaw((perVolIdx * RATING_CONFIG.offense.perVol) + (perEffIdx * RATING_CONFIG.offense.perEff));
      
      const playmaking = scaleRaw(getIndex(r.raw.playmakingRaw, b_play));
      const rebounding = scaleRaw(getIndex(r.raw.reboundingRaw, b_reb));
      
      const perimVolIdx = getIndex(r.raw.perimDefRaw, b_perim);
      const postVolIdx = getIndex(r.raw.postDefRaw, b_post);
      const dbpmIdx = getIndex(r.raw.dbpmNorm, b_dbpmNorm);
      
      let perimeterDefense = scaleRaw((perimVolIdx * RATING_CONFIG.defense.vol) + (dbpmIdx * RATING_CONFIG.defense.skill));
      let postDefense = scaleRaw((postVolIdx * RATING_CONFIG.defense.vol) + (dbpmIdx * RATING_CONFIG.defense.skill));
    
      const isAllDef = r.awards.some((a: AwardRow) => a.name === "All-Defensive");
      if (isAllDef) {
          const defTeam = r.awards.find((a: AwardRow) => a.name === "All-Defensive")?.level || 2;
          const floor = defTeam === 1 ? 96 : 90;
          if (perimeterDefense >= postDefense) perimeterDefense = Math.max(perimeterDefense, floor);
          else postDefense = Math.max(postDefense, floor);
      }
      
      const pool = r.pool;
      const cfg = RATING_CONFIG.ovr;
      const w_profile = cfg.PROFILES[pool];
      
      const ratingsArr = [finishing, midRange, perimeter, playmaking, rebounding, perimeterDefense, postDefense];
      const w_eff = w_profile.map(w => w * (1 - (cfg.TOP1 + cfg.TOP2) / 100));
      
      const indices = [0, 1, 2, 3, 4, 5, 6];
      indices.sort((a, b) => {
          if (ratingsArr[b] === ratingsArr[a]) return a - b;
          return ratingsArr[b] - ratingsArr[a];
      });
      
      w_eff[indices[0]] += cfg.TOP1;
      w_eff[indices[1]] += cfg.TOP2;
      
      let raw = 0;
      for (let i = 0; i < 7; i++) {
          raw += (w_eff[i] * ratingsArr[i]) / 100;
      }
      
      for (let i = 0; i < 7; i++) {
          if (w_profile[i] <= cfg.OFFROLE_MAX_W) {
              raw += cfg.FORGIVE * (w_profile[i] / 100) * Math.max(0, cfg.REF - ratingsArr[i]);
          }
      }
      
      // Core-Gap Penalty
      const w_sorted = [...w_profile].sort((a, b) => b - a);
      const threshold = w_sorted[2]; // 3rd highest weight
      
      let corePenalty = 0;
      for (let i = 0; i < 7; i++) {
          if (w_profile[i] >= threshold) {
              corePenalty += cfg.CORE_PEN * (w_profile[i] / 100) * Math.max(0, cfg.CORE_REF - ratingsArr[i]);
          }
      }
      raw -= corePenalty;
      
      // RESTORE COMPOSITE ADVANCED SCORE MULTIPLIER
      const perIndex = getIndex(stat.per, b_per_stat);
      const vorpIndex = getIndex(r.raw.vorpNorm, b_vorpNorm);
      const defBpmIndex = getIndex(r.raw.dbpmNorm, b_dbpmNorm);
      
      const compositeAdvancedScore = (perIndex * 0.40) + (vorpIndex * 0.40) + (defBpmIndex * 0.20);
      const multiplier = 0.80 + (compositeAdvancedScore * 0.35); 
      
      let overall = Math.round(raw * multiplier);
      overall = Math.max(40, Math.min(99, overall));
      
      let rarity: Rarity = "Common";
      if (overall >= 90) rarity = "Mythic";
      else if (overall >= 80) rarity = "Rare";
      else if (overall >= 65) rarity = "Uncommon";

      const hasMvp = r.awards.some((a: AwardRow) => a.name === "MVP");
      const hasAllNba1 = r.awards.some((a: AwardRow) => a.name === "All-NBA" && a.level === 1);
      const hasAllNba = r.awards.some((a: AwardRow) => a.name === "All-NBA");
      const hasDpoy = r.awards.some((a: AwardRow) => a.name === "DPOY");
      const hasAllDef = r.awards.some((a: AwardRow) => a.name === "All-Defensive");
      const isLegendary = LEGENDARY_PLAYERS.has(p.name);
      
      const fg3m = stat.fg3a * stat.fg3_pct;
      const isLeagueLeader = (
          stat.pts >= maxPts || 
          stat.ast >= maxAst || 
          stat.trb >= maxTrb || 
          stat.stl >= maxStl || 
          stat.blk >= maxBlk || 
          fg3m >= max3pm
      );
      
      const bumpRarity = (current: Rarity): Rarity => {
          if (current === "Common") return "Uncommon";
          if (current === "Uncommon") return "Rare";
          return "Mythic";
      };

      // 1. BASE AWARDS BUMP
      if ((hasMvp || hasAllNba1) && rarity !== "Mythic") rarity = "Mythic";
      else if ((hasAllNba || hasDpoy) && rarity !== "Mythic" && rarity !== "Rare") rarity = "Rare";
      else if (hasAllDef && rarity === "Common") rarity = "Uncommon";

      // 2. LEGENDARY BUMP (Adds 1 tier, making drafting harder)
      if (isLegendary) {
          rarity = bumpRarity(rarity);
      }

      // 3. LEAGUE LEADER BUMP
      if (isLeagueLeader) {
          rarity = bumpRarity(rarity);
      }

      const traits: Trait[] = [];
      let b;
      b = getBadge(finishing, "Finisher"); if (b) traits.push(b);
      b = getBadge(midRange, "Mid-Range Maestro"); if (b) traits.push(b);
      b = getBadge(perimeter, "Sharpshooter"); if (b) traits.push(b);
      b = getBadge(playmaking, "Floor General"); if (b) traits.push(b);
      b = getBadge(rebounding, "Glass Cleaner"); if (b) traits.push(b);
      b = getBadge(perimeterDefense, "Lockdown Defender"); if (b) traits.push(b);
      b = getBadge(postDefense, "Paint Protector"); if (b) traits.push(b);
      
      if (isLegendary) traits.push({ name: "Legend", level: 3 });
      if (isLeagueLeader) traits.push({ name: "League Leader", level: 3 });
      
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
      
      const formattedAwards: string[] = [];
      for (const a of r.awards) {
          if (a.name === "All-NBA" || a.name === "All-Defensive") {
              const suffix = a.level === 1 ? "1st" : a.level === 2 ? "2nd" : "3rd";
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
        ratings: { overall, finishing, midRange, perimeter, playmaking, rebounding, perimeterDefense, postDefense, _baseOvr: raw, _multiplier: multiplier },
        traits,
        rarity
      });
    }

    cache = cards;
    return cards;
}
