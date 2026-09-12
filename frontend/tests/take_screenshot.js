const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // You can pass the URL as an argument, defaults to mock-home
    const url = process.argv[2] || 'http://localhost:3000/mock-home';
    const outputPath = process.argv[3] || path.join(__dirname, '..', 'screenshot.png');
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    
    console.log(`Taking screenshot...`);
    await page.screenshot({ path: outputPath });
    
    console.log(`Screenshot saved to ${outputPath}`);
  } catch (e) {
    console.error('Error taking screenshot:', e);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
