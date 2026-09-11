import fs from 'fs';

const path = 'src/lib/engine.ts';
let code = fs.readFileSync(path, 'utf-8');

const regexRawReturn = /raw: \{ finFGM, finEff, midFGM, midEff, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat\.per, vorp: stat\.vorp, dbpm: stat\.dbpm \}/g;
const replacementRawReturn = `raw: { finFGA, finFGM, finEff, midFGA, midFGM, midEff, perFGA, perFGM, perEff, playmakingRaw, reboundingRaw, perimDefRaw, postDefRaw, per: stat.per, vorp: stat.vorp, dbpm: stat.dbpm }`;
code = code.replace(regexRawReturn, replacementRawReturn);

const regexGlobalPush = /for \(const r of rawScores\) \{[\s\S]*?globalStats\.per_stat\.push\(r\.raw\.per\);\s*\}/g;
const replacementGlobalPush = `for (const r of rawScores) {
        globalStats.finFGM.push(r.raw.finFGM);
        if (r.raw.finFGA >= 2.0) globalStats.finEff.push(r.raw.finEff);
        
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

fs.writeFileSync(path, code);
console.log("Refactored engine.ts with FGA floors!");
