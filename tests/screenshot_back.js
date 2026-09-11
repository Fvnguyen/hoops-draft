const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Hover over the first card to trigger flip
  const firstCard = await page.locator('[style*="perspective"]').first();
  await firstCard.hover();
  await page.waitForTimeout(1000); // wait for flip animation
  
  await page.screenshot({ path: 'screenshot_back.png', fullPage: false });
  console.log('Screenshot saved to screenshot_back.png');
  await browser.close();
})();
