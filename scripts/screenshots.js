#!/usr/bin/env node
'use strict';

/**
 * Generate App Store screenshots for Out of Bounds.
 *
 * Signs in via the reviewer flow on the actual UI, then captures
 * 6 screens at 6.7", 6.1", and 6.9" iPhone sizes.
 *
 * Usage: node scripts/screenshots.js <REVIEWER_CODE>
 *
 * Output: docs/screens/appstore/{67,61,69}/
 */

var fs = require('fs');
var path = require('path');
var { chromium } = require('playwright');

var LIVE_URL = 'https://outofboundsscoring.netlify.app';

// App Store screenshot sizes (portrait)
var SIZES = [
  { name: '67', width: 1290, height: 2796, desc: '6.7" iPhone 15 Pro Max' },
  { name: '61', width: 1179, height: 2556, desc: '6.1" iPhone 15 Pro' },
  { name: '69', width: 1320, height: 2868, desc: '6.9" iPhone 16 Pro Max' }
];

var outDir = path.join(__dirname, '..', 'docs', 'screens', 'appstore');

async function signIn(page, code) {
  await page.goto(LIVE_URL + '/o/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Click "Sign in with email"
  var emailBtn = await page.locator('button:has-text("Sign in with email")');
  await emailBtn.click();
  await page.waitForTimeout(500);

  // Type the reviewer email
  var emailInput = await page.locator('#magic-email');
  await emailInput.fill('review@outofboundsevents.com');
  await page.waitForTimeout(500);

  // The code field should appear
  var codeInput = await page.locator('#reviewer-code');
  await codeInput.waitFor({ state: 'visible', timeout: 3000 });
  await codeInput.fill(code);
  await page.waitForTimeout(300);

  // Click Sign in
  var signInBtn = await page.locator('#magic-btn');
  await signInBtn.click();

  // Wait for the dashboard to load (sign-in screen disappears)
  await page.waitForSelector('.event-card, #screen-dashboard, [id*="dashboard"]', { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(3000);
}

async function captureScreens(size, code) {
  var dir = path.join(outDir, size.name);
  fs.mkdirSync(dir, { recursive: true });

  console.log('\n  ' + size.desc + ' (' + size.width + 'x' + size.height + ')');

  var browser = await chromium.launch();
  var context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  });

  var page = await context.newPage();

  // Sign in via the UI
  console.log('    Signing in...');
  await signIn(page, code);

  // 1. EVENTS (dashboard)
  console.log('    1/6 events (dashboard)...');
  await page.screenshot({ path: path.join(dir, 'events.png') });

  // 2. SETUP (event editor) — click first event card
  console.log('    2/6 setup (event editor)...');
  var eventCard = await page.locator('.event-card').first();
  if (await eventCard.count() > 0) {
    await eventCard.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // 3. LIVEDAY — grab the finished event ID from the page and open it directly
  console.log('    3/6 liveday (finished event view)...');
  var finishedId = await page.evaluate(function () {
    var card = document.querySelector('.event-card.ev-finished');
    if (!card) return null;
    var onclick = card.getAttribute('onclick') || '';
    var match = onclick.match(/openEvent\(['"]([^'"]+)['"]\)/);
    return match ? match[1] : null;
  });
  if (finishedId) {
    await page.evaluate(function (id) { window.openEvent(id); }, finishedId);
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(dir, 'liveday.png') });

  // 3. SCORING (player find) — open in same context, public page
  console.log('    4/6 scoring (player find)...');
  await page.goto(LIVE_URL + '/p/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'scoring.png') });

  // 5. BIGSCREEN (board) — use landscape-ish viewport temporarily? No, keep portrait.
  console.log('    5/6 bigscreen (board)...');
  await page.goto(LIVE_URL + '/board/#/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(dir, 'bigscreen.png') });

  // 6. RESULTS
  console.log('    6/6 results...');
  await page.goto(LIVE_URL + '/r/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'results.png') });

  await browser.close();
  console.log('    Done: ' + dir);
}

async function main() {
  var code = process.argv[2];
  if (!code) {
    console.error('Usage: node scripts/screenshots.js <REVIEWER_CODE>');
    process.exit(1);
  }

  console.log('=== App Store Screenshots ===');
  console.log('Output: ' + outDir);

  for (var i = 0; i < SIZES.length; i++) {
    await captureScreens(SIZES[i], code);
  }

  console.log('\n=== All screenshots generated ===');
}

main().catch(function (err) {
  console.error('\nERROR:', err.message || err);
  process.exit(1);
});
