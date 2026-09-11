import fs from 'fs';

const path = 'src/lib/engine.ts';
let code = fs.readFileSync(path, 'utf-8');

const regexMap = /\/\/ NEW DISTANCE OFFENSIVE STATS[\s\S]*?raw: \{ finFGA, finFGM, finEff, midFGA, midFGM, midEff, perFGA, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat\.per, vorp: stat\.vorp, dbpm: stat\.dbpm \}/g;

const replacementMap = `// NEW DISTANCE OFFENSIVE STATS (Restructured per user request)
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
        raw: { finFGA, finFGM, finEff, ftEff, midFGA, midFGM, midEff, perFGA, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm }`;

code = code.replace(regexMap, replacementMap);

const regexGlobalPush = /globalStats\.finFGM\.push\(r\.raw\.finFGM\);[\s\S]*?globalStats\.per_stat\.push\(r\.raw\.per\);\s*\}/g;

const replacementGlobalPush = `globalStats.finFGM.push(r.raw.finFGM);
        if (r.raw.finFGA >= 1.0) globalStats.finEff.push(r.raw.finEff); // 1.0 floor for efficiency qualification
        globalStats.ftEff.push(r.raw.ftEff);
        
        globalStats.midFGM.push(r.raw.midFGM);
        if (r.raw.midFGA >= 2.0) globalStats.midEff.push(r.raw.midEff);
        
        globalStats.perFGM.push(r.raw.perFGM);
        if (r.raw.perFGA >= 2.0) globalStats.perEff.push(r.raw.perEff);
        
        globalStats.play.push(r.raw.playmakingRaw);
        globalStats.reb.push(r.raw.reboundingRaw);
        globalStats.perim.push(r.raw.perimDefRaw);
        globalStats.post.push(r.raw.postDefRaw);
        globalStats.per_stat.push(r.raw.per);
    }`;
code = code.replace(regexGlobalPush, replacementGlobalPush);

// Also we need to add ftEff to the globalStats object init
const regexGlobalInit = /finFGM: \[\] as number\[\], finEff: \[\] as number\[\],/g;
const replacementGlobalInit = `finFGM: [] as number[], finEff: [] as number[], ftEff: [] as number[],`;
code = code.replace(regexGlobalInit, replacementGlobalInit);

// Add b_ftEff to benchmarks
const regexBfin = /const b_finEff = getTop5Avg\(globalStats\.finEff\);/g;
const replacementBfin = `const b_finEff = getTop5Avg(globalStats.finEff);\n    const b_ftEff = getTop5Avg(globalStats.ftEff);`;
code = code.replace(regexBfin, replacementBfin);

const regexCalc = /const finVolIdx = getIndex\(r\.raw\.finFGM, b_finFGM\);[\s\S]*?const perimeter = scaleRaw\(\(perVolIdx \* 0\.35\) \+ \(perEffIdx \* 0\.65\)\);/g;

const replacementCalc = `const finVolIdx = getIndex(r.raw.finFGM, b_finFGM);
      const finEffIdx = r.raw.finFGA >= 1.0 ? getIndex(r.raw.finEff, b_finEff) : 0; // 0 floor if no attempts
      const ftEffIdx = getIndex(r.raw.ftEff, b_ftEff);
      const finishing = scaleRaw((finVolIdx * 0.35) + (finEffIdx * 0.45) + (ftEffIdx * 0.20));
      
      const midVolIdx = getIndex(r.raw.midFGM, b_midFGM);
      const midEffIdx = r.raw.midFGA >= 1.0 ? getIndex(r.raw.midEff, b_midEff) : 0;
      const midRange = scaleRaw((midVolIdx * 0.35) + (midEffIdx * 0.65));
      
      const perVolIdx = getIndex(r.raw.perFGM, b_perFGM);
      const perEffIdx = r.raw.perFGA >= 1.0 ? getIndex(r.raw.perEff, b_perEff) : 0;
      const perimeter = scaleRaw((perVolIdx * 0.35) + (perEffIdx * 0.65));`;

code = code.replace(regexCalc, replacementCalc);

fs.writeFileSync(path, code);
console.log("Refactored engine.ts with final structure!");
