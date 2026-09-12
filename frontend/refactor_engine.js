import fs from 'fs';

const path = 'src/lib/engine.ts';
let code = fs.readFileSync(path, 'utf-8');

const regex = /\/\/ Calculate percentiles against specific pools[\s\S]*?const rebounding = scale\(getPct\(r\.raw\.reboundingRaw, pool\.reb\)\);\s*let perimeterDefense = scale\(getPct\(r\.raw\.perimDefRaw, pool\.perim\)\);\s*let postDefense = scale\(getPct\(r\.raw\.postDefRaw, pool\.post\)\);/g;

const replacement = `// NEW INDEX SCALING SYSTEM
    const getTop5Avg = (arr: number[]) => {
      const sorted = [...arr].sort((a,b) => b - a);
      const topCount = Math.max(1, Math.floor(arr.length * 0.05));
      let sum = 0;
      for (let i = 0; i < topCount; i++) sum += sorted[i];
      return sum / topCount;
    };
    
    // Global Arrays for Benchmarks
    const globalStats = {
        fin: [] as number[], mid: [] as number[], per: [] as number[],
        play: [] as number[], reb: [] as number[], perim: [] as number[], post: [] as number[],
        per_stat: [] as number[]
    };
    
    for (const r of rawScores) {
        globalStats.fin.push(r.raw.finRaw);
        globalStats.mid.push(r.raw.midRaw);
        globalStats.per.push(r.raw.perRaw);
        globalStats.play.push(r.raw.playmakingRaw);
        globalStats.reb.push(r.raw.reboundingRaw);
        globalStats.perim.push(r.raw.perimDefRaw);
        globalStats.post.push(r.raw.postDefRaw);
        globalStats.per_stat.push(r.raw.per);
    }
    
    const b_fin = getTop5Avg(globalStats.fin);
    const b_mid = getTop5Avg(globalStats.mid);
    const b_per = getTop5Avg(globalStats.per);
    const b_play = getTop5Avg(globalStats.play);
    const b_reb = getTop5Avg(globalStats.reb);
    const b_perim = getTop5Avg(globalStats.perim);
    const b_post = getTop5Avg(globalStats.post);
    const b_per_stat = getTop5Avg(globalStats.per_stat);
  
    for (const r of rawScores) {
      const p = r.player;
      const stat = r.stat;
      
      const getIndex = (val: number, benchmark: number) => {
          if (benchmark <= 0) return 0;
          return Math.min(1.0, val / benchmark);
      };
      
      const scaleRaw = (idx: number) => Math.round(idx * 99.0); // Raw Index scaling!
      
      const finishing = scaleRaw(getIndex(r.raw.finRaw, b_fin));
      const midRange = scaleRaw(getIndex(r.raw.midRaw, b_mid));
      const perimeter = scaleRaw(getIndex(r.raw.perRaw, b_per));
      
      const playmaking = scaleRaw(getIndex(r.raw.playmakingRaw, b_play));
      const rebounding = scaleRaw(getIndex(r.raw.reboundingRaw, b_reb));
      let perimeterDefense = scaleRaw(getIndex(r.raw.perimDefRaw, b_perim));
      let postDefense = scaleRaw(getIndex(r.raw.postDefRaw, b_post));`;

code = code.replace(regex, replacement);

const multiplierRegex = /\/\/ Advanced Stats Multiplier[\s\S]*?const multiplier = 0\.8 \+ \(advancedPct \* 0\.4\);/g;
const multReplacement = `// Advanced Stats Multiplier (Index-based)
      // NBA Avg PER is 15. The benchmark is top 5% (around 26).
      const perIndex = getIndex(stat.per, b_per_stat);
      // We map the 0-100% index to a multiplier. 
      // A PER of 15 / 26 is ~0.57 index. We want that to be a 1.0x multiplier.
      // Math: 0.80 + (Index * 0.35) -> 0.57 * 0.35 = 0.20 -> 1.00x
      // Top 5% (1.0 index) -> 0.80 + 0.35 = 1.15x
      const multiplier = 0.80 + (perIndex * 0.35);`;

code = code.replace(multiplierRegex, multReplacement);

fs.writeFileSync(path, code);
console.log("Refactored engine.ts!");
