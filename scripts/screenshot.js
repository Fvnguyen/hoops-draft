#!/usr/bin/env node
/**
 * Generic Screenshot Tool
 *
 * Captures a screenshot of a running app using Playwright.
 *
 * Usage:
 *   node scripts/screenshot.js [route] [outfile] [--full]
 *
 * Defaults: route="/", outfile="screenshots/<route-slug>.png"
 * Base URL from env BASE_URL or http://localhost:3000
 * Viewport: 1400x900 (or full page if --full)
 */

const path = require('path');
const fs = require('fs');

(async () => {
  const { chromium } = require('playwright');

  const route = process.argv[2] || '/';
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const fullPage = process.argv.includes('--full');

  // Compute output filename
  let outfile = process.argv[3];
  if (!outfile) {
    const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
    const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    outfile = path.join(screenshotsDir, `${slug}.png`);
  }

  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    const url = new URL(route, baseUrl).toString();
    console.log(`Navigating to ${url}...`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    } catch (e) {
      if (e.message.includes('ERR_CONNECTION_REFUSED') || e.message.includes('ECONNREFUSED')) {
        console.error(`Error: Could not reach server at ${baseUrl}`);
        console.error('Is the dev server running? Try: npm run dev');
        process.exit(1);
      }
      throw e;
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: outfile, fullPage });

    console.log(`Saved: ${outfile}`);
    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
