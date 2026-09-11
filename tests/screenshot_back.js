const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  // Home page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshot_home.png', fullPage: false });
  console.log('Home page screenshot saved');

  // Draft page
  await page.goto('http://localhost:3000/draft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'tests/screenshot_draft.png', fullPage: false });
  console.log('Draft page screenshot saved');

  // Hover first card for flip + badge check
  const cards = page.locator('[style*="perspective"]');
  const count = await cards.count();
  if (count > 0) {
    await cards.first().hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/screenshot_flip.png', fullPage: false });
    console.log('Flip screenshot saved');
  }

  await browser.close();
})();
