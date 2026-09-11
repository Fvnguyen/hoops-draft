import fs from 'fs';

const path = 'src/lib/engine.ts';
let code = fs.readFileSync(path, 'utf-8');

// Inject RATING_CONFIG at the top of the function
const funcStart = /export function computeCards\(players: any\[\], statsRows: any\[\], awards: any\[\]\) \{/g;
const configInjection = `export function computeCards(players: any[], statsRows: any[], awards: any[]) {
    const RATING_CONFIG = {
        benchmarkCutoff: 0.05,
        offense: {
            finVol: 0.35, finEff: 0.45, finFT: 0.20,
            midVol: 0.35, midEff: 0.65,
            perVol: 0.35, perEff: 0.65
        },
        defense: {
            vol: 0.40,
            skill: 0.60
        }
    };
    const minDbpm = Math.min(...statsRows.map(r => r.dbpm || 0));`;

code = code.replace(funcStart, configInjection);

// Replace defense raw calculation
const regexDefRaw = /const perimDefRaw = \(stat\.stl \* 15\.0\) \+ \(stat\.dbpm \* 5\.0\);\s*const postDefRaw = \(stat\.blk \* 15\.0\) \+ \(stat\.dbpm \* 5\.0\);/g;
const replacementDefRaw = `const perimDefRaw = stat.stl || 0;
      const postDefRaw = stat.blk || 0;
      const dbpmNorm = (stat.dbpm || 0) - minDbpm;`;
code = code.replace(regexDefRaw, replacementDefRaw);

// Add dbpmNorm to raw return
const regexRawReturn = /perimDefRaw, postDefRaw, per: stat\.per, vorp: stat\.vorp, dbpm: stat\.dbpm \}/g;
const replacementRawReturn = `perimDefRaw, postDefRaw, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm, dbpmNorm }`;
code = code.replace(regexRawReturn, replacementRawReturn);

// Replace getTop5Avg with Configured benchmark
const regexTop5 = /const getTop5Avg = \(arr: number\[\]\) => \{[\s\S]*?return sum \/ topCount;\s*\};/g;
const replacementTop5 = `const getBenchmark = (arr: number[]) => {
      const sorted = [...arr].sort((a,b) => b - a);
      const topCount = Math.max(1, Math.floor(arr.length * RATING_CONFIG.benchmarkCutoff));
      let sum = 0;
      for (let i = 0; i < topCount; i++) sum += sorted[i];
      return sum / topCount;
    };`;
code = code.replace(regexTop5, replacementTop5);

// Update global arrays
const regexGlobalDef = /perim: \[\] as number\[\], post: \[\] as number\[\],/g;
const replacementGlobalDef = `perim: [] as number[], post: [] as number[], dbpmNorm: [] as number[],`;
code = code.replace(regexGlobalDef, replacementGlobalDef);

const regexGlobalPush = /globalStats\.perim\.push\(r\.raw\.perimDefRaw\);\s*globalStats\.post\.push\(r\.raw\.postDefRaw\);/g;
const replacementGlobalPush = `globalStats.perim.push(r.raw.perimDefRaw);
        globalStats.post.push(r.raw.postDefRaw);
        globalStats.dbpmNorm.push(r.raw.dbpmNorm);`;
code = code.replace(regexGlobalPush, replacementGlobalPush);

// Update all getTop5Avg calls to getBenchmark
code = code.replace(/getTop5Avg/g, 'getBenchmark');

// Add b_dbpmNorm
const regexBpost = /const b_post = getBenchmark\(globalStats\.post\);/g;
const replacementBpost = `const b_post = getBenchmark(globalStats.post);
    const b_dbpmNorm = getBenchmark(globalStats.dbpmNorm);`;
code = code.replace(regexBpost, replacementBpost);

// Replace Config scaling formulas
const regexScaleFormulas = /const finVolIdx = getIndex\(r\.raw\.finFGM, b_finFGM\);[\s\S]*?let postDefense = scaleRaw\(getIndex\(r\.raw\.postDefRaw, b_post\)\);/g;

const replacementScaleFormulas = `const finVolIdx = getIndex(r.raw.finFGM, b_finFGM);
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
      let postDefense = scaleRaw((postVolIdx * RATING_CONFIG.defense.vol) + (dbpmIdx * RATING_CONFIG.defense.skill));`;
      
code = code.replace(regexScaleFormulas, replacementScaleFormulas);

fs.writeFileSync(path, code);
console.log("Refactored engine.ts with Defense separation and CONFIG!");
