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

    await browser.close();
    console.log("HTML successfully downloaded to disk.");
}

scrapeBRef().catch(console.error);
