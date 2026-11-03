// Daily current-season per-game refresh (season_2026_27 D6/T4).
// Scrapes ONE basketball-reference page and writes frontend/public/data/season-stats.json,
// keyed by card id. Run from data/: `node refresh_stats.js`.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'season_config.json'), 'utf8'));
const season = cfg.current; // "2026-27"
const endYear = Number(season.slice(0, 4)) + 1; // bref URL uses the END year
const cardsPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'cards.json');
const outPath = path.join(__dirname, '..', 'frontend', 'public', 'data', 'season-stats.json');

const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*$/, '')
    .replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const url = `https://www.basketball-reference.com/leagues/NBA_${endYear}_per_game.html`;
  console.log(`Fetching ${url}`);
  // Not 'networkidle': ad and tracker requests keep the page busy, and from a CI runner
  // it never settles. The table is in the server-rendered HTML.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#per_game_stats tbody tr', { timeout: 60000 });
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#per_game_stats tbody tr').forEach((tr) => {
      if (tr.classList.contains('thead')) return;
      const rec = {};
      tr.querySelectorAll('td,th').forEach((c) => {
        const k = c.getAttribute('data-stat');
        if (k) rec[k] = c.textContent.trim();
      });
      if (rec.name_display || rec.player) out.push(rec);
    });
    return out;
  });
  await browser.close();

  // Combined 2TM/3TM row comes first for traded players: keep the first row per name.
  const byName = new Map();
  for (const r of rows) {
    const name = norm(r.name_display || r.player);
    if (!name || byName.has(name)) continue;
    byName.set(name, r);
  }
  console.log(`Parsed ${rows.length} rows, ${byName.size} unique players`);
  if (byName.size < 300) {
    console.error(`Fewer than 300 players parsed (${byName.size}); refusing to write.`);
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  const list = Array.isArray(cards) ? cards : Object.values(cards);
  const players = {};
  const used = new Set();
  for (const c of list) {
    const r = byName.get(norm(c.player && c.player.name));
    if (!r) continue;
    used.add(norm(c.player.name));
    const fga = num(r.fga_per_g), fg3a = num(r.fg3a_per_g);
    players[c.id] = {
      gp: Math.round(num(r.games)),
      gs: Math.round(num(r.games_started)),
      mpg: r1(num(r.mp_per_g)),
      pts: r1(num(r.pts_per_g)),
      trb: r1(num(r.trb_per_g)),
      ast: r1(num(r.ast_per_g)),
      stl: r1(num(r.stl_per_g)),
      blk: r1(num(r.blk_per_g)),
      fga: r1(fga),
      fg3a: r1(fg3a),
      fta: r1(num(r.fta_per_g)),
      fg_pct: r3(num(r.fg_pct)),
      fg3_pct: r3(num(r.fg3_pct)),
      fg2_pct: r3(num(r.fg2_pct)),
      ft_pct: r3(num(r.ft_pct)),
    };
  }
  const sorted = {};
  for (const id of Object.keys(players).sort()) sorted[id] = players[id];

  const asOf = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify({ asOf, season, players: sorted }, null, 1) + '\n';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json);

  console.log(`Matched ${Object.keys(sorted).length} of ${list.length} cards`);
  const unmatched = [];
  for (const [name, r] of byName) {
    if (!used.has(name) && num(r.mp_per_g) >= 15) unmatched.push(`${r.name_display || r.player} (${r.mp_per_g} mpg)`);
  }
  console.log(`Unmatched players with MPG >= 15: ${unmatched.length}`);
  unmatched.forEach((u) => console.log('  ' + u));
}

main().catch((e) => { console.error(e); process.exit(1); });
