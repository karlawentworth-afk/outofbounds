'use strict';
// Native mode DOM assertions — brief 015 items 1 and 2
// Checks: no tier/plan language, no cropping at bottom
// Usage: REVIEWER_CODE=479649 TEST_URL=https://score.outofboundsevents.com node tests/_native-assertions.js

var fs = require('fs');
var path = require('path');
var https = require('https');
var { chromium } = require('playwright');

var BASE = process.env.TEST_URL || 'https://score.outofboundsevents.com';
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY = (function () {
  try {
    var raw = fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.local.json'), 'utf8');
    var m = raw.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    return m ? m[0] : '';
  } catch (e) { return process.env.SUPABASE_SERVICE_KEY || ''; }
})();
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';

var passed = 0, failed = 0, total = 0;
function step(label, ok, detail) {
  total++;
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Forbidden strings in native visible text (case-insensitive where noted)
var FORBIDDEN = [
  'Pro', 'Play plan', 'Play pass', 'PLAN', 'upgrade', 'Upgrade',
  'billing', 'Billing', '£', 'paid', 'Paid', 'included with',
  'trial', 'subscription', 'Test mode'
];

function checkForbidden(text, screenName) {
  var hits = [];
  FORBIDDEN.forEach(function (term) {
    // "plan" alone: check case-sensitive to avoid "explain", "plant" etc.
    if (term === 'PLAN' && text.indexOf('PLAN') !== -1) hits.push(term);
    else if (term === 'Pro' && text.match(/\bPro\b/)) hits.push(term);
    else if (term !== 'PLAN' && term !== 'Pro' && text.indexOf(term) !== -1) hits.push(term);
  });
  // Also check for "plan" as a standalone word (tier context)
  if (text.match(/\b[Pp]lan\b/) && !text.match(/plan your|planning|floor plan|game plan/i)) {
    hits.push('plan (standalone)');
  }
  return hits;
}

function checkCropping(page, screenName) {
  return page.evaluate(function () {
    // Scroll to the very bottom
    var screen = document.querySelector('.screen.active');
    if (screen) screen.scrollTop = screen.scrollHeight;
    // Wait a tick for layout
    return new Promise(function (resolve) {
      setTimeout(function () {
        var sc = document.querySelector('.screen.active');
        if (!sc) return resolve({ ok: false, reason: 'no active screen' });
        var children = sc.querySelectorAll('*');
        var vpHeight = window.innerHeight;
        var clipped = [];
        // Check last few visible elements
        for (var i = children.length - 1; i >= Math.max(0, children.length - 20); i--) {
          var rect = children[i].getBoundingClientRect();
          if (rect.height > 0 && rect.bottom > vpHeight + 2) {
            clipped.push(children[i].tagName + '.' + (children[i].className || '').split(' ')[0] + ' bottom=' + Math.round(rect.bottom) + ' vp=' + vpHeight);
          }
        }
        resolve({ ok: clipped.length === 0, clipped: clipped.slice(0, 3) });
      }, 200);
    });
  });
}

async function runViewport(width, height, dpr, label) {
  console.log('\n=== ' + label + ' (' + width + 'x' + height + ' @' + dpr + 'x) ===');
  var browser = await chromium.launch();
  var ctx = await browser.newContext({
    viewport: { width: width, height: height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true
  });
  var page = await ctx.newPage();

  // Sign in via session injection
  await page.goto(BASE + '/o/?native=1', { waitUntil: 'load', timeout: 30000 });
  for (var w = 0; w < 20; w++) { await sleep(500); if (await page.evaluate(function () { var el = document.getElementById('native-welcome'); return el && el.offsetHeight > 0; })) break; }

  // Create a test user and inject session
  var ts = Date.now();
  var email = 'native-assert-' + ts + '@example.com';
  var pass = 'Assert_' + ts + '!';

  // Use service key to create user
  var user = await new Promise(function (resolve, reject) {
    var p = JSON.stringify({ email: email, password: pass, email_confirm: true });
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/auth/v1/admin/users', method: 'POST', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) } }, function (res) { var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(p); req.end();
  });

  // Create throwaway org
  var orgP = JSON.stringify({ name: 'Assert Org', slug: 'assert-' + ts, auth_user_id: user.id });
  var orgRes = await new Promise(function (resolve, reject) {
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/rest/v1/organisers', method: 'POST', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(orgP), 'Prefer': 'return=representation' } }, function (res) { var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(orgP); req.end();
  });
  var orgId = orgRes[0].id;

  // Sign in
  var signin = await new Promise(function (resolve, reject) {
    var p = JSON.stringify({ email: email, password: pass });
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/auth/v1/token?grant_type=password', method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) } }, function (res) { var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(p); req.end();
  });

  // Inject session and reload
  await page.evaluate(function (t) {
    localStorage.setItem('sb-ahutmswadskdkqhnrhhh-auth-token', JSON.stringify({
      access_token: t.a, refresh_token: t.r, token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600
    }));
  }, { a: signin.access_token, r: signin.refresh_token });
  await page.reload({ waitUntil: 'load' });
  for (var d = 0; d < 30; d++) { await sleep(500); if (await page.evaluate(function () { var el = document.getElementById('screen-dashboard'); return el && el.offsetHeight > 0; })) break; }

  // ── Check dashboard ──
  var dashText = await page.evaluate(function () { return document.body.innerText; });
  var dashHits = checkForbidden(dashText, 'dashboard');
  step(label + ' dashboard: no forbidden text', dashHits.length === 0, dashHits.length ? dashHits.join(', ') : 'clean');

  var dashCrop = await checkCropping(page, 'dashboard');
  step(label + ' dashboard: no cropping', dashCrop.ok, dashCrop.ok ? 'clean' : JSON.stringify(dashCrop.clipped));

  // ── Check settings ──
  await page.evaluate(function () { if (typeof goToSettings === 'function') goToSettings(); });
  await sleep(3000);
  var setText = await page.evaluate(function () { return document.body.innerText; });
  var setHits = checkForbidden(setText, 'settings');
  step(label + ' settings: no forbidden text', setHits.length === 0, setHits.length ? setHits.join(', ') : 'clean');

  var setCrop = await checkCropping(page, 'settings');
  step(label + ' settings: no cropping', setCrop.ok, setCrop.ok ? 'clean' : JSON.stringify(setCrop.clipped));

  // Cleanup
  await new Promise(function (resolve) {
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/rest/v1/organisers?id=eq.' + orgId, method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function () { resolve(); });
    req.on('error', function () { resolve(); }); req.end();
  });
  await new Promise(function (resolve) {
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/auth/v1/admin/users/' + user.id, method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }, function () { resolve(); });
    req.on('error', function () { resolve(); }); req.end();
  });

  await ctx.close();
  await browser.close();
}

(async function () {
  console.log('=== Native Assertions ===');
  console.log('Target: ' + BASE);
  await runViewport(440, 956, 3, 'iPhone 17 Pro Max');
  await runViewport(820, 1180, 2, 'iPad Air 11-inch');

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + total + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) { console.error('FATAL:', e.message); process.exit(1); });
