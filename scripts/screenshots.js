#!/usr/bin/env node
'use strict';

/**
 * Generate App Store screenshots for Out of Bounds.
 *
 * Captures 6 screens at 6.7", 6.1", and 6.9" iPhone sizes from
 * the Fairway Events demo organiser.
 *
 * Usage: node scripts/screenshots.js <REVIEWER_CODE>
 *   (reviewer-login function must be deployed and REVIEWER_CODE set in Netlify)
 *
 * Output: docs/screens/appstore/{67,61,69}/
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var { chromium } = require('playwright');

var LIVE_URL = 'https://outofboundsscoring.netlify.app';
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';

// App Store screenshot sizes (portrait)
var SIZES = [
  { name: '67', width: 1290, height: 2796, desc: '6.7" iPhone 15 Pro Max' },
  { name: '61', width: 1179, height: 2556, desc: '6.1" iPhone 15 Pro' },
  { name: '69', width: 1320, height: 2868, desc: '6.9" iPhone 16 Pro Max' }
];

var SCREENS = ['events', 'setup', 'scoring', 'liveday', 'bigscreen', 'results'];

var outDir = path.join(__dirname, '..', 'docs', 'screens', 'appstore');

// --- Auth via reviewer-login function ---

function reviewerLogin(code) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      email: 'review@outofboundsevents.com',
      code: code
    });

    var req = https.request({
      hostname: 'outofboundsscoring.netlify.app',
      port: 443,
      path: '/.netlify/functions/reviewer-login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var data = JSON.parse(raw);
          if (res.statusCode !== 200 || data.error) {
            reject(new Error(data.error || 'reviewer-login returned ' + res.statusCode));
            return;
          }
          resolve(data);
        } catch (e) {
          reject(new Error('Bad response: ' + raw.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- Screenshot capture ---

async function captureScreens(size, authPayload) {
  var dir = path.join(outDir, size.name);
  fs.mkdirSync(dir, { recursive: true });

  console.log('\n  ' + size.desc + ' (' + size.width + 'x' + size.height + ')');

  var browser = await chromium.launch();
  var context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
  });

  var page = await context.newPage();

  // 1. EVENTS (dashboard) — needs auth
  console.log('    1/6 events (dashboard)...');
  await page.goto(LIVE_URL + '/o/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function (payload) {
    localStorage.setItem('sb-ahutmswadskdkqhnrhhh-auth-token', payload);
  }, authPayload);
  await page.goto(LIVE_URL + '/o/#dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(dir, 'events.png') });

  // 2. SETUP (event editor) — needs auth
  // Navigate to first event to show setup
  console.log('    2/6 setup (event editor)...');
  // Click the first event card on dashboard
  var eventCard = await page.$('.event-card, [onclick*="event-"]');
  if (eventCard) {
    await eventCard.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // 3. SCORING (player find/scoring view) — public
  console.log('    3/6 scoring (player find)...');
  await page.goto(LIVE_URL + '/p/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'scoring.png') });

  // 4. LIVEDAY (organiser live/finished view) — needs auth
  console.log('    4/6 liveday (organiser event view)...');
  await page.goto(LIVE_URL + '/o/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function (payload) {
    localStorage.setItem('sb-ahutmswadskdkqhnrhhh-auth-token', payload);
  }, authPayload);
  await page.goto(LIVE_URL + '/o/#dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Click first event to see live/finished view
  eventCard = await page.$('.event-card, [onclick*="event-"]');
  if (eventCard) {
    await eventCard.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(dir, 'liveday.png') });

  // 5. BIGSCREEN (board view) — public
  console.log('    5/6 bigscreen (board)...');
  await page.goto(LIVE_URL + '/board/#/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(dir, 'bigscreen.png') });

  // 6. RESULTS — public
  console.log('    6/6 results...');
  await page.goto(LIVE_URL + '/r/demo/autumn-invitational', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'results.png') });

  await browser.close();
  console.log('    Done: ' + dir);
}

// --- Main ---

async function main() {
  var code = process.argv[2];
  if (!code) {
    console.error('Usage: node scripts/screenshots.js <REVIEWER_CODE>');
    console.error('  Set REVIEWER_CODE in Netlify env vars first, then pass the same code here.');
    process.exit(1);
  }

  console.log('=== App Store Screenshots ===');
  console.log('Output: ' + outDir + '\n');

  console.log('Signing in via reviewer-login...');
  var auth = await reviewerLogin(code);
  console.log('Signed in. Building auth payload...');

  var authPayload = JSON.stringify({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'reviewer' }
  });

  for (var i = 0; i < SIZES.length; i++) {
    await captureScreens(SIZES[i], authPayload);
  }

  console.log('\n=== All screenshots generated ===');
  console.log('Check ' + outDir + ' for the images.');
  console.log('Run the ASC submit script next: node scripts/asc-submit.js');
}

main().catch(function (err) {
  console.error('\nERROR:', err.message || err);
  process.exit(1);
});
