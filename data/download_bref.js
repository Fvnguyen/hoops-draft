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

    const season = 2026;
    console.log("Fetching Per Game stats...");
    await page.goto(`https://www.basketball-reference.com/leagues/NBA_${season}_per_game.html`, { waitUntil: 'networkidle' });
    const perGameHTML = await page.content();
    fs.writeFileSync(path.join(__dirname, 'per_game.html'), perGameHTML);

    console.log("Fetching Advanced stats...");
    await page.waitForTimeout(3000); // polite delay
    await page.goto(`https://www.basketball-reference.com/leagues/NBA_${season}_advanced.html`, { waitUntil: 'networkidle' });
    const advancedHTML = await page.content();
    fs.writeFileSync(path.join(__dirname, 'advanced.html'), advancedHTML);

    console.log("Fetching Shooting stats...");
    await page.waitForTimeout(3000); // polite delay
    await page.goto(`https://www.basketball-reference.com/leagues/NBA_${season}_shooting.html`, { waitUntil: 'networkidle' });
    const shootingHTML = await page.content();
    fs.writeFileSync(path.join(__dirname, 'shooting.html'), shootingHTML);

    console.log("Fetching Awards...");
    await page.waitForTimeout(3000);
    const awardsUrl = `https://www.basketball-reference.com/leagues/NBA_${season}.html`;
    try {
        await page.goto(awardsUrl, { waitUntil: 'networkidle' });
        const awardsHTML = await page.content();
        fs.writeFileSync(path.join(__dirname, 'awards.html'), awardsHTML);
    } catch (e) {
        console.log("Failed to fetch awards", e);
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
            if (toYear === String(season)) activeIds[name] = id;
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
