const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  // Draft page with sidebar
  await page.goto('http://localhost:3000/draft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  
  // Click the sidebar toggle to open it
  const sidebarBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
  // Click the first card to select it and open sidebar
  const cards = page.locator('[style*="perspective"]');
  if (await cards.count() > 0) {
    await cards.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: 'tests/screenshot_draft_sidebar.png', fullPage: false });
  console.log('Draft sidebar screenshot saved');

  // Data viewer
  await page.goto('http://localhost:3000/data', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshot_data.png', fullPage: false });
  console.log('Data viewer screenshot saved');

  await browser.close();
})();
