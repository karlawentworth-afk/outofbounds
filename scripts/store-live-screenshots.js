// Take screenshots of store-live features
// Run: node scripts/store-live-screenshots.js

'use strict';

var { chromium } = require('playwright');
var path = require('path');
var fs = require('fs');

var PREVIEW = 'https://store-live-preview--outofboundsscoring.netlify.app';
var PROD = 'https://outofboundsscoring.netlify.app';
var REVIEWER_CODE = '479649';
var OUT = path.join(__dirname, '..', 'docs', 'screens', 'store-live');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function signIn(page, baseUrl) {
  await page.goto(baseUrl + '/o/', { waitUntil: 'networkidle', timeout: 20000 });
  var resp = await page.evaluate(async function (code) {
    var res = await fetch('/.netlify/functions/reviewer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'review@outofboundsevents.com', code: code })
    });
    return res.json();
  }, REVIEWER_CODE);

  if (resp.access_token) {
    await page.evaluate(function (data) {
      var SB_URL = 'https://ahutmswadskdkqhnrhhh.supabase.co';
      var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';
      var sb = window.supabase.createClient(SB_URL, SB_ANON);
      return sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token || '' });
    }, resp);
    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    await sleep(3000);
    return true;
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  var browser = await chromium.launch({ headless: true });

  // ── Store banner on preview branch (STORE_LIVE=true, no sign-in needed for banner) ──
  // The store banner shows on page load before sign-in check
  console.log('1/8  /o/ store banner @ 390');
  var ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var p1 = await ctx1.newPage();
  await p1.goto(PREVIEW + '/o/', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(1000);
  await p1.screenshot({ path: path.join(OUT, 'o-store-banner-390.png'), fullPage: false });
  await ctx1.close();
  console.log('     Saved');

  console.log('2/8  /o/ store banner @ 1280');
  var ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  var p2 = await ctx2.newPage();
  await p2.goto(PREVIEW + '/o/', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(1000);
  await p2.screenshot({ path: path.join(OUT, 'o-store-banner-1280.png'), fullPage: false });
  await ctx2.close();
  console.log('     Saved');

  // ── Settings with delete row (production, needs sign-in) ──
  console.log('3/8  Settings (delete row) @ 390');
  var ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var p3 = await ctx3.newPage();
  var ok3 = await signIn(p3, PROD);
  console.log('     Signed in:', ok3);
  if (ok3) {
    var sb = p3.locator('[onclick*="goToSettings"]').first();
    if (await sb.isVisible({ timeout: 5000 }).catch(function () { return false; })) {
      await sb.click();
      await sleep(2000);
      // Scroll to bottom to show delete row
      await p3.evaluate(function () {
        var el = document.querySelector('[onclick*="deleteAccount"]');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await sleep(500);
    }
  }
  await p3.screenshot({ path: path.join(OUT, 'settings-delete-390.png'), fullPage: false });
  await ctx3.close();
  console.log('     Saved');

  console.log('4/8  Settings (delete row) @ 1280');
  var ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  var p4 = await ctx4.newPage();
  var ok4 = await signIn(p4, PROD);
  console.log('     Signed in:', ok4);
  if (ok4) {
    var sb2 = p4.locator('[onclick*="goToSettings"]').first();
    if (await sb2.isVisible({ timeout: 5000 }).catch(function () { return false; })) {
      await sb2.click();
      await sleep(2000);
      await p4.evaluate(function () {
        var el = document.querySelector('[onclick*="deleteAccount"]');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await sleep(500);
    }
  }
  await p4.screenshot({ path: path.join(OUT, 'settings-delete-1280.png'), fullPage: false });
  await ctx4.close();
  console.log('     Saved');

  // ── Marketing hero badges (preview branch) ──
  console.log('5/8  Marketing hero @ 390');
  var ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var p5 = await ctx5.newPage();
  await p5.goto(PREVIEW + '/marketing/', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(1000);
  await p5.screenshot({ path: path.join(OUT, 'marketing-hero-390.png'), fullPage: false });
  console.log('     Saved');

  console.log('6/8  Marketing hero @ 1280');
  var ctx6 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  var p6 = await ctx6.newPage();
  await p6.goto(PREVIEW + '/marketing/', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(1000);
  await p6.screenshot({ path: path.join(OUT, 'marketing-hero-1280.png'), fullPage: false });
  console.log('     Saved');

  // ── Marketing footer badges ──
  console.log('7/8  Marketing footer @ 390');
  await p5.evaluate(function () { document.querySelector('.footer').scrollIntoView(); });
  await sleep(500);
  await p5.screenshot({ path: path.join(OUT, 'marketing-footer-390.png'), fullPage: false });
  await ctx5.close();
  console.log('     Saved');

  console.log('8/8  Marketing footer @ 1280');
  await p6.evaluate(function () { document.querySelector('.footer').scrollIntoView(); });
  await sleep(500);
  await p6.screenshot({ path: path.join(OUT, 'marketing-footer-1280.png'), fullPage: false });
  await ctx6.close();
  console.log('     Saved');

  await browser.close();
  console.log('\nDone. Screenshots in docs/screens/store-live/');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
