const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Navigate to deckbuilder test
  await page.goto('http://localhost:3000/deckbuilder-test', { waitUntil: 'networkidle' });
  
  // Wait a bit for animations/images to settle
  await page.waitForTimeout(2000);
  
  // Take screenshot
  const screenshotPath = path.join(__dirname, 'deckbuilder_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  console.log(`Screenshot saved to ${screenshotPath}`);
  
  await browser.close();
})();
