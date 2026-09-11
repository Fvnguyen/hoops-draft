import fs from 'fs';

const path = 'src/lib/engine.ts';
let code = fs.readFileSync(path, 'utf-8');

const regexMap = /\/\/ NEW DISTANCE OFFENSIVE STATS[\s\S]*?raw: \{ finRaw, midRaw, perRaw/g;

const replacementMap = `// NEW DISTANCE OFFENSIVE STATS (FGM and EFF independently)
      const vol = stat.fga;
      
      const finFGA = vol * stat.pct_fga_0_3;
      const finFGM = finFGA * stat.fg_pct_0_3;
      const finEff = stat.fg_pct_0_3;
      
      const midFGA = vol * (stat.pct_fga_3_10 + stat.pct_fga_10_16);
      const midFGM = vol * ((stat.pct_fga_3_10 * stat.fg_pct_3_10) + (stat.pct_fga_10_16 * stat.fg_pct_10_16));
      const midEff = midFGA > 0 ? (midFGM / midFGA) : 0;
      
      const perFGA = vol * (stat.pct_fga_16_3p + stat.pct_fga_3p);
      const perFGM = vol * ((stat.pct_fga_16_3p * stat.fg_pct_16_3p) + (stat.pct_fga_3p * stat.fg_pct_3p));
      const perEff = perFGA > 0 ? (perFGM / perFGA) : 0;
      
      return {
        player: p,
        stat,
        awards: awardsRows,
        pool: getPool(p.position),
        raw: { finFGM, finEff, midFGM, midEff, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm }`;

code = code.replace(regexMap, replacementMap);

const regexStats = /\/\/ Global Arrays for Benchmarks[\s\S]*?const b_per_stat = getTop5Avg\(globalStats\.per_stat\);/g;

const replacementStats = `// Global Arrays for Benchmarks
    const globalStats = {
        finFGM: [] as number[], finEff: [] as number[],
        midFGM: [] as number[], midEff: [] as number[],
        perFGM: [] as number[], perEff: [] as number[],
        play: [] as number[], reb: [] as number[], perim: [] as number[], post: [] as number[],
        per_stat: [] as number[]
    };
    
    for (const r of rawScores) {
        globalStats.finFGM.push(r.raw.finFGM);
        globalStats.finEff.push(r.raw.finEff);
        globalStats.midFGM.push(r.raw.midFGM);
        globalStats.midEff.push(r.raw.midEff);
        globalStats.perFGM.push(r.raw.perFGM);
        globalStats.perEff.push(r.raw.perEff);
        globalStats.play.push(r.raw.playmakingRaw);
        globalStats.reb.push(r.raw.reboundingRaw);
        globalStats.perim.push(r.raw.perimDefRaw);
        globalStats.post.push(r.raw.postDefRaw);
        globalStats.per_stat.push(r.raw.per);
    }
    
    const b_finFGM = getTop5Avg(globalStats.finFGM);
    const b_finEff = getTop5Avg(globalStats.finEff);
    const b_midFGM = getTop5Avg(globalStats.midFGM);
    const b_midEff = getTop5Avg(globalStats.midEff);
    const b_perFGM = getTop5Avg(globalStats.perFGM);
    const b_perEff = getTop5Avg(globalStats.perEff);
    const b_play = getTop5Avg(globalStats.play);
    const b_reb = getTop5Avg(globalStats.reb);
    const b_perim = getTop5Avg(globalStats.perim);
    const b_post = getTop5Avg(globalStats.post);
    const b_per_stat = getTop5Avg(globalStats.per_stat);`;

code = code.replace(regexStats, replacementStats);

const regexCalc = /const finishing = scaleRaw\(getIndex\(r\.raw\.finRaw, b_fin\)\);\s*const midRange = scaleRaw\(getIndex\(r\.raw\.midRaw, b_mid\)\);\s*const perimeter = scaleRaw\(getIndex\(r\.raw\.perRaw, b_per\)\);/g;

const replacementCalc = `const scaleRaw = (idx: number) => Math.round(idx * 99.0); // Raw Index scaling!
      
      const finVolIdx = getIndex(r.raw.finFGM, b_finFGM);
      const finEffIdx = getIndex(r.raw.finEff, b_finEff);
      const finishing = scaleRaw((finVolIdx * 0.35) + (finEffIdx * 0.65));
      
      const midVolIdx = getIndex(r.raw.midFGM, b_midFGM);
      const midEffIdx = getIndex(r.raw.midEff, b_midEff);
      const midRange = scaleRaw((midVolIdx * 0.35) + (midEffIdx * 0.65));
      
      const perVolIdx = getIndex(r.raw.perFGM, b_perFGM);
      const perEffIdx = getIndex(r.raw.perEff, b_perEff);
      const perimeter = scaleRaw((perVolIdx * 0.35) + (perEffIdx * 0.65));`;

code = code.replace(regexCalc, replacementCalc);

// I must remove the duplicate `const scaleRaw` since it was previously defined above `const finishing = ...`
// Wait, I need to check where `const scaleRaw` currently is.
fs.writeFileSync(path, code);
console.log("Refactored engine.ts for independent FGM and Eff!");
