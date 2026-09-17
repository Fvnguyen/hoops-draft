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

    await browser.close();
    console.log("HTML successfully downloaded to disk.");
}

scrapeBRef().catch(console.error);
