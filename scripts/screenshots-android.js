#!/usr/bin/env node
'use strict';

/**
 * Generate Play Store screenshots for Out of Bounds.
 * 1080x1920 at 360x640 CSS px, deviceScaleFactor 3.
 *
 * Usage: node scripts/screenshots-android.js <REVIEWER_CODE>
 * Output: docs/screens/playstore/
 */

var fs = require('fs');
var path = require('path');
var { chromium } = require('playwright');

var LIVE_URL = 'https://outofboundsscoring.netlify.app';
var outDir = path.join(__dirname, '..', 'docs', 'screens', 'playstore');

async function signIn(page, code) {
  await page.goto(LIVE_URL + '/o/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  var emailBtn = await page.locator('button:has-text("Sign in with email")');
  await emailBtn.click();
  await page.waitForTimeout(500);
  var emailInput = await page.locator('#magic-email');
  await emailInput.fill('review@outofboundsevents.com');
  await page.waitForTimeout(500);
  var codeInput = await page.locator('#reviewer-code');
  await codeInput.waitFor({ state: 'visible', timeout: 3000 });
  await codeInput.fill(code);
  await page.waitForTimeout(300);
  var signInBtn = await page.locator('#magic-btn');
  await signInBtn.click();
  await page.waitForSelector('.event-card', { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(3000);
}

async function main() {
  var code = process.argv[2];
  if (!code) { console.error('Usage: node scripts/screenshots-android.js <REVIEWER_CODE>'); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });
  console.log('=== Play Store Screenshots (1080x1920) ===\n');

  var browser = await chromium.launch();
  var context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
  });

  var page = await context.newPage();

  console.log('Signing in...');
  await signIn(page, code);

  // 1. EVENTS (dashboard)
  console.log('1/6 events...');
  await page.screenshot({ path: path.join(outDir, 'events.png') });

  // 2. SETUP — click first event
  console.log('2/6 setup...');
  var eventCard = await page.locator('.event-card').first();
  if (await eventCard.count() > 0) {
    await eventCard.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(outDir, 'setup.png') });

  // 3. LIVEDAY — open finished event
  console.log('3/6 liveday...');
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
  await page.screenshot({ path: path.join(outDir, 'liveday.png') });

  // 4. SCORING (player find)
  console.log('4/6 scoring...');
  await page.goto(LIVE_URL + '/p/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, 'scoring.png') });

  // 5. BIGSCREEN (board)
  console.log('5/6 bigscreen...');
  await page.goto(LIVE_URL + '/board/#/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outDir, 'bigscreen.png') });

  // 6. RESULTS
  console.log('6/6 results...');
  await page.goto(LIVE_URL + '/r/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, 'results.png') });

  await browser.close();
  console.log('\nDone: ' + outDir);
}

main().catch(function (err) { console.error('ERROR:', err.message); process.exit(1); });
