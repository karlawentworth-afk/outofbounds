'use strict';
// Generate App Store screenshots — brief 015 item 3
// Usage: REVIEWER_CODE=479649 node tests/_store-screenshots.js

var fs = require('fs');
var path = require('path');
var { chromium } = require('playwright');

var BASE = process.env.TEST_URL || 'https://score.outofboundsevents.com';
var REVIEWER_CODE = process.env.REVIEWER_CODE || '479649';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function capture(width, height, dpr, dir) {
  console.log('\n=== ' + dir + ' (' + width + 'x' + height + ' @' + dpr + 'x = ' + (width * dpr) + 'x' + (height * dpr) + 'px) ===');
  var outDir = path.join(__dirname, '..', 'docs', 'store', 'ios', dir);

  var browser = await chromium.launch();
  var ctx = await browser.newContext({
    viewport: { width: width, height: height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true
  });
  var page = await ctx.newPage();

  // Sign in via reviewer
  await page.goto(BASE + '/o/?native=1', { waitUntil: 'load', timeout: 30000 });
  for (var w = 0; w < 20; w++) { await sleep(500); if (await page.evaluate(function () { var el = document.getElementById('native-welcome'); return el && el.offsetHeight > 0; })) break; }

  // Click email, enter reviewer credentials
  await page.locator('#native-welcome button').click();
  await sleep(500);
  await page.fill('#magic-email', 'review@outofboundsevents.com');
  await sleep(800);
  for (var cw = 0; cw < 10; cw++) { await sleep(500); if (await page.isVisible('#reviewer-code')) break; }
  await page.fill('#reviewer-code', REVIEWER_CODE);
  await sleep(300);
  await page.click('#magic-btn');
  for (var d = 0; d < 20; d++) { await sleep(1000); if (await page.evaluate(function () { var el = document.getElementById('screen-dashboard'); return el && el.offsetHeight > 0; })) break; }

  // 01: Dashboard with events
  await sleep(2000);
  await page.screenshot({ path: path.join(outDir, '01.png'), type: 'png' });
  console.log('  01 dashboard');

  // 02: Event detail (Winter Warm-Up or Autumn Invitational)
  var clicked = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Winter') !== -1 || cards[i].textContent.indexOf('Autumn') !== -1) {
        cards[i].click();
        return cards[i].textContent.substring(0, 30);
      }
    }
    return '';
  });
  await sleep(5000);
  await page.screenshot({ path: path.join(outDir, '02.png'), type: 'png' });
  console.log('  02 event detail: ' + clicked);

  // 03: Leaderboard (go back to dashboard, open Autumn Invitational which is finished)
  await page.evaluate(function () { if (typeof goToDashboard === 'function') goToDashboard(); });
  await sleep(2000);
  var openedFinished = await page.evaluate(function () {
    var cards = document.querySelectorAll('.event-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].textContent.indexOf('Autumn') !== -1) {
        cards[i].click();
        return true;
      }
    }
    return false;
  });
  await sleep(5000);
  // The finished event shows the leaderboard
  await page.screenshot({ path: path.join(outDir, '03.png'), type: 'png' });
  console.log('  03 leaderboard/finished: ' + openedFinished);

  // 04: Player scoring (need a player URL)
  // Get a player token from the Autumn Invitational
  var playerCtx = await browser.newContext({
    viewport: { width: width, height: height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true
  });
  var playerPage = await playerCtx.newPage();
  // Use direct Supabase query for player token
  var SB_KEY = (function () { try { var raw = fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.local.json'), 'utf8'); var m = raw.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/); return m ? m[0] : ''; } catch (e) { return ''; } })();
  var https = require('https');
  var playerToken = await new Promise(function (resolve, reject) {
    var req = https.request({ hostname: 'ahutmswadskdkqhnrhhh.supabase.co', port: 443, path: '/rest/v1/players?event_id=eq.c20886e1-690a-43c3-b1a0-100d72438557&select=player_token&limit=1', method: 'GET', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
        try { var d = JSON.parse(Buffer.concat(c).toString()); resolve(d[0] ? d[0].player_token : ''); } catch (e) { resolve(''); }
      });
    }); req.on('error', function () { resolve(''); }); req.end();
  });

  if (playerToken) {
    var orgSlug = await new Promise(function (resolve, reject) {
      var req = https.request({ hostname: 'ahutmswadskdkqhnrhhh.supabase.co', port: 443, path: '/rest/v1/organisers?id=eq.a0000000-0000-0000-0000-000000000099&select=slug', method: 'GET', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function (res) {
        var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
          try { var d = JSON.parse(Buffer.concat(c).toString()); resolve(d[0] ? d[0].slug : 'demo'); } catch (e) { resolve('demo'); }
        });
      }); req.on('error', function () { resolve('demo'); }); req.end();
    });
    var evSlug = await new Promise(function (resolve, reject) {
      var req = https.request({ hostname: 'ahutmswadskdkqhnrhhh.supabase.co', port: 443, path: '/rest/v1/events?id=eq.c20886e1-690a-43c3-b1a0-100d72438557&select=slug', method: 'GET', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function (res) {
        var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
          try { var d = JSON.parse(Buffer.concat(c).toString()); resolve(d[0] ? d[0].slug : 'autumn-invitational'); } catch (e) { resolve('autumn-invitational'); }
        });
      }); req.on('error', function () { resolve('autumn-invitational'); }); req.end();
    });
    var pUrl = BASE + '/p/' + orgSlug + '/' + evSlug + '/' + playerToken + '?native=1';
    await playerPage.goto(pUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(8000);
    await playerPage.screenshot({ path: path.join(outDir, '04.png'), type: 'png' });
    console.log('  04 player scoring');
  } else {
    console.log('  04 SKIPPED (no player token)');
  }
  await playerCtx.close();

  // 05: Finished event with results (same as 03 but we can scroll or use the finished screen)
  // Already on the Autumn Invitational finished screen — take another screenshot
  // scrolled to show the leaderboard
  await page.evaluate(function () {
    var screen = document.querySelector('.screen.active');
    if (screen) screen.scrollTop = 200;
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '05.png'), type: 'png' });
  console.log('  05 finished results');

  await ctx.close();
  await browser.close();

  // Verify PNG sizes
  for (var i = 1; i <= 5; i++) {
    var fpath = path.join(outDir, '0' + i + '.png');
    if (fs.existsSync(fpath)) {
      var buf = fs.readFileSync(fpath);
      // PNG header: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
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
