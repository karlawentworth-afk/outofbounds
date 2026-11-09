'use strict';
// Generate App Store screenshots with reviewer account after demo-reset
// Usage: REVIEWER_CODE=479649 node tests/_store-screenshots.js

var fs = require('fs');
var path = require('path');
var https = require('https');
var { chromium } = require('playwright');

var BASE = process.env.TEST_URL || 'https://score.outofboundsevents.com';
var REVIEWER_CODE = process.env.REVIEWER_CODE || '479649';
var SB_KEY = (function () { try { var raw = fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.local.json'), 'utf8'); var m = raw.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/); return m ? m[0] : ''; } catch (e) { return ''; } })();
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function sbGet(path) {
  return new Promise(function (resolve, reject) {
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/rest/v1/' + path, method: 'GET', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { resolve([]); } });
    }); req.on('error', function () { resolve([]); }); req.end();
  });
}

async function capture(width, height, dpr, dir) {
  console.log('\n=== ' + dir + ' (' + width + 'x' + height + ' @' + dpr + 'x = ' + (width * dpr) + 'x' + (height * dpr) + 'px) ===');
  var outDir = path.join(__dirname, '..', 'docs', 'store', 'ios', dir);

  var browser = await chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: width, height: height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  var page = await ctx.newPage();

  // Sign in as reviewer
  await page.goto(BASE + '/o/?native=1', { waitUntil: 'load', timeout: 30000 });
  for (var w = 0; w < 20; w++) { await sleep(500); if (await page.evaluate(function () { var el = document.getElementById('native-welcome'); return el && el.offsetHeight > 0; })) break; }
  await page.locator('#native-welcome button').click();
  await sleep(500);
  await page.fill('#magic-email', 'review@outofboundsevents.com');
  await sleep(800);
  for (var cw = 0; cw < 10; cw++) { await sleep(500); if (await page.isVisible('#reviewer-code')) break; }
  await page.fill('#reviewer-code', REVIEWER_CODE);
  await sleep(300);
  await page.click('#magic-btn');

  // Wait for dashboard with events loaded
  for (var d = 0; d < 30; d++) {
    await sleep(1000);
    var hasEvents = await page.evaluate(function () {
      var cards = document.querySelectorAll('.event-card');
      return cards.length >= 3;
    });
    if (hasEvents) break;
  }
  await sleep(2000);

  // 01: Dashboard
  await page.screenshot({ path: path.join(outDir, '01.png'), type: 'png' });
  console.log('  01 dashboard');

  // 02: Winter Warm-Up Groups tab
  var clickedWW = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Winter') !== -1) { cards[i].click(); return true; }
    }
    return false;
  });
  await sleep(5000);
  // Switch to Groups tab (step 3)
  var groupsTab = await page.evaluate(function () {
    var tabs = document.querySelectorAll('.step');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].textContent.indexOf('Groups') !== -1 || tabs[i].dataset.tab === 'groups') {
        tabs[i].click();
        return true;
      }
    }
    return false;
  });
  await sleep(3000);
  await page.screenshot({ path: path.join(outDir, '02.png'), type: 'png' });
  console.log('  02 Winter Warm-Up groups: clicked=' + clickedWW + ' tab=' + groupsTab);

  // Go back to dashboard
  await page.evaluate(function () { if (typeof goToDashboard === 'function') goToDashboard(); });
  await sleep(3000);

  // 03: Autumn Invitational finished with leaderboard
  var clickedAI = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Autumn') !== -1) { cards[i].click(); return true; }
    }
    return false;
  });
  await sleep(5000);
  await page.screenshot({ path: path.join(outDir, '03.png'), type: 'png' });
  console.log('  03 Autumn Invitational finished: ' + clickedAI);

  // Go back to dashboard
  await page.evaluate(function () { if (typeof goToDashboard === 'function') goToDashboard(); });
  await sleep(3000);

  // 04: Spring Charity Classic Live tab with leaderboard
  var clickedSCC = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Spring') !== -1) { cards[i].click(); return true; }
    }
    return false;
  });
  await sleep(5000);
  // The live event should show the Live tab by default
  await page.screenshot({ path: path.join(outDir, '04.png'), type: 'png' });
  console.log('  04 Spring Charity Classic live: ' + clickedSCC);

  // Go back to dashboard
  await page.evaluate(function () { if (typeof goToDashboard === 'function') goToDashboard(); });
  await sleep(2000);

  // 05: Scroll to finished section for another finished event
  await page.evaluate(function () {
    var screen = document.querySelector('.screen.active');
    if (screen) screen.scrollTop = screen.scrollHeight;
  });
  await sleep(2000);
  // Click Summer Club Open or first finished event
  var clickedFinished = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card.finished, .event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Summer') !== -1 || cards[i].textContent.indexOf('Thursday') !== -1) { cards[i].click(); return cards[i].textContent.substring(0, 20); }
    }
    return '';
  });
  await sleep(5000);
  await page.screenshot({ path: path.join(outDir, '05.png'), type: 'png' });
  console.log('  05 finished: ' + clickedFinished);

  await ctx.close();
  await browser.close();

  // Verify sizes
  for (var i = 1; i <= 5; i++) {
    var fpath = path.join(outDir, '0' + i + '.png');
    if (fs.existsSync(fpath)) {
      var buf = fs.readFileSync(fpath);
      var pw = buf.readUInt32BE(16);
      var ph = buf.readUInt32BE(20);
      console.log('  0' + i + '.png: ' + pw + 'x' + ph + ' pixels');
    }
  }
}

(async function () {
  await capture(440, 956, 3, 'iphone-69');
  await capture(1032, 1376, 2, 'ipad-13');
  console.log('\nDone.');
})().catch(function (e) { console.error('FATAL:', e.message); process.exit(1); });
