const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeBRef() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set headers
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // season_2026_27 D1: every season string comes from season_config.json. bref names a
    // season by its END year ("2026-27" -> NBA_2027). Each season's pages land in
    // data/bref/<season>/. The current season has no awards yet; priors get theirs, since
    // a player's awards follow the prior season his blend uses (D7).
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'season_config.json'), 'utf-8'));
    const endYear = (s) => Number(s.split('-')[0]) + 1;
    const season = endYear(config.current);
    const pages = [
        ['per_game', (y) => `NBA_${y}_per_game.html`],
        ['advanced', (y) => `NBA_${y}_advanced.html`],
        ['shooting', (y) => `NBA_${y}_shooting.html`],
        ['awards', (y) => `NBA_${y}.html`],
    ];
    for (const s of [config.current, ...config.priors]) {
        const dir = path.join(__dirname, 'bref', s);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        for (const [name, url] of pages) {
            if (name === 'awards' && s === config.current) continue;
            console.log(`Fetching ${s} ${name}...`);
            await page.waitForTimeout(3000); // polite delay
            try {
                const resp = await page.goto(`https://www.basketball-reference.com/leagues/${url(endYear(s))}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                if (!resp || resp.status() !== 200) throw new Error(`status ${resp && resp.status()}`);
                fs.writeFileSync(path.join(dir, `${name}.html`), await page.content());
            } catch (e) {
                console.log(`Failed to fetch ${s} ${name}`, e.message);
                process.exitCode = 1;
            }
        }
    }

    // card_ratings_rebalance D10 (2026-09-18): the 26 letter-index pages
    // (/players/a/ .. /players/z/) carry each player's Pos and career "To" year —
    // bref-native, so fetch_players.py can match it against per_game/advanced/shooting's
    // Player column exactly instead of bio.csv's fuzzy cross-source match. Rate-limited
    // to one request every 3 seconds, same as every other page here.
    const posDir = path.join(__dirname, 'bref_positions');
    if (!fs.existsSync(posDir)) fs.mkdirSync(posDir);
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {
        const outPath = path.join(posDir, `players_${letter}.html`);
        console.log(`Fetching position index ${letter}...`);
        await page.waitForTimeout(3000);
        try {
            const resp = await page.goto(`https://www.basketball-reference.com/players/${letter}/`, { waitUntil: 'domcontentloaded' });
            if (resp && resp.status() === 200) {
                fs.writeFileSync(outPath, await page.content());
            } else {
                console.log(`status ${resp && resp.status()} for letter ${letter}`);
            }
        } catch (e) {
            console.log(`Failed to fetch position index for ${letter}`, e);
        }
    }

    // D10 follow-up (2026-09-19, owner finding): the letter-index pages above still only
    // carry a broad G/F/C side per player — real granular multi-position eligibility
    // (e.g. Shai Gilgeous-Alexander "Point Guard and Shooting Guard", Scottie Barnes
    // "Power Forward, Shooting Guard, and Small Forward") lives only on each player's own
    // bio page ("Position: X[, Y][, and Z]" in the #meta block). A raw HTML snapshot per
    // player would be ~1.4MB x 582 - too large to commit - so this extracts just the
    // Position line into a compact JSON map (name -> text), same pattern as
    // players.json/computed_cards.json being derived artifacts, not raw dumps.
    console.log("Extracting active player IDs from the position index...");
    const activeIds = {}; // name -> bref id
    const rowRe = /<th scope="row"[^>]*><strong><a href="\/players\/\w\/(\w+)\.html">([^<]+)<\/a><\/strong><\/th><td class="right " data-stat="year_min">\d+<\/td><td class="right " data-stat="year_max">(\d+)<\/td>/g;
    for (const letter of letters) {
        const html = fs.readFileSync(path.join(posDir, `players_${letter}.html`), 'utf-8');
        let m;
        rowRe.lastIndex = 0;
        while ((m = rowRe.exec(html))) {
            const [, id, name, toYear] = m;
            if (Number(toYear) >= season - 1) activeIds[name] = id;
        }
    }
    console.log(`Found ${Object.keys(activeIds).length} active players.`);

    const posOutPath = path.join(__dirname, 'bref_player_positions.json');
    const positions = fs.existsSync(posOutPath) ? JSON.parse(fs.readFileSync(posOutPath, 'utf-8')) : {};
    let done = 0;
    for (const [name, id] of Object.entries(activeIds)) {
        done++;
        if (positions[name]) continue; // resumable across runs
        const letter = id[0];
        await page.waitForTimeout(3000);
        try {
            const resp = await page.goto(`https://www.basketball-reference.com/players/${letter}/${id}.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            if (resp && resp.status() === 200) {
                const text = await page.evaluate(() => document.querySelector('#meta')?.innerText || '');
                const posMatch = text.match(/Position:\s*([^▪\n]+)/);
                positions[name] = posMatch ? posMatch[1].trim() : '';
                if (done % 25 === 0) {
                    console.log(`[${done}/${Object.keys(activeIds).length}] ${name} -> ${positions[name]}`);
                    fs.writeFileSync(posOutPath, JSON.stringify(positions, null, 1));
                }
            } else {
                console.log(`status ${resp && resp.status()} for ${name} (${id})`);
            }
        } catch (e) {
            console.log(`Failed to fetch bio position for ${name} (${id})`, e.message);
        }
    }
    fs.writeFileSync(posOutPath, JSON.stringify(positions, null, 1));

    await browser.close();
    console.log("HTML successfully downloaded to disk.");
}

scrapeBRef().catch(console.error);
