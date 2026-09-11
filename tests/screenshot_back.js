const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  // Navigate to draft page where cards are rendered
  await page.goto('http://localhost:3000/draft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  
  // Screenshot front state
  await page.screenshot({ path: 'tests/screenshot_front.png', fullPage: false });
  console.log('Front screenshot saved');

  // Find a card by looking for the card container with perspective style
  // PlayerCard uses style={{ perspective: 1000 }}
  const cards = page.locator('[style*="perspective"]');
  const count = await cards.count();
  console.log(`Found ${count} cards with perspective style`);
  
  if (count > 0) {
    await cards.first().hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/screenshot_back.png', fullPage: false });
    console.log('Back screenshot saved');
  } else {
    // Fallback: try to find any card-like element
    await page.screenshot({ path: 'tests/screenshot_nocard.png', fullPage: false });
    console.log('No perspective cards found - screenshot saved for debugging');
  }

  await browser.close();
})();
