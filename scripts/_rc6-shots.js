// _rc6-shots.js — Screenshots and sign-in error test for design-system-rc6
// Run: SUPABASE_SERVICE_KEY=... node scripts/_rc6-shots.js
// Requires: playwright

'use strict';

var https = require('https');
var { chromium } = require('playwright');

var BRANCH_URL = 'https://design-system--outofboundsscoring.netlify.app';
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY = process.env.SUPABASE_SERVICE_KEY;
var SHOT_DIR = 'docs/screens/design-system';

var passed = 0;
var failed = 0;

function step(label, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function sbAuth(method, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : null;
    var headers = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var opts = { hostname: SB_HOST, port: 443, path: '/auth/v1/' + path, method: method, headers: headers };
    var timer = setTimeout(function () { reject(new Error('Timeout')); }, 15000);
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(new Error('Bad JSON')); }
      });
    });
    req.on('error', function (e) { clearTimeout(timer); reject(e); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getSession(email) {
  var linkRes = await sbAuth('POST', 'admin/generate_link', { type: 'magiclink', email: email });
  if (linkRes.status !== 200 || !linkRes.data) return null;
  var actionLink = linkRes.data.action_link || '';
  var urlMatch = actionLink.match(/[?&]token=([^&#]+)/);
  var otp = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
  var hashedToken = linkRes.data.hashed_token || (linkRes.data.properties && linkRes.data.properties.hashed_token);
  var session = null;
  if (otp) {
    var r = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: otp });
    if (r.status === 200 && r.data && r.data.access_token) session = r.data;
  }
  if (!session && hashedToken) {
    var r2 = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: hashedToken });
    if (r2.status === 200 && r2.data && r2.data.access_token) session = r2.data;
  }
  return session;
}

async function signInAndWait(page, session) {
  await page.goto(BRANCH_URL + '/o/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(function (s) {
    try {
      localStorage.setItem('sb-ahutmswadskdkqhnrhhh-auth-token', JSON.stringify(s));
    } catch (e) {}
  }, session);
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  // Wait for dashboard to load (appbar becomes visible)
  await page.waitForFunction(function () {
    var a = document.getElementById('oob-appbar');
    return a && a.style.display !== 'none';
  }, { timeout: 20000 }).catch(function () {});
  await sleep(2000);
}

(async function () {
  if (!SB_KEY) { console.error('SUPABASE_SERVICE_KEY not set'); process.exit(1); }

  var browser = await chromium.launch({ headless: true });

  try {
    // ── 1. Appbar screenshots with Karla's brand colour ──────────
    console.log('\n--- Appbar brand-ink screenshots ---');
    var session = await getSession('karla.wentworth@thatsclevermx.com');
    console.log('  Auth: session ' + (session ? 'obtained' : 'MISSING'));

    if (session) {
      async function takeAppbarShot(width, height, filename, clipH) {
        var ctx = await browser.newContext({ viewport: { width: width, height: height } });
        var page = await ctx.newPage();
        await signInAndWait(page, session);
        // Override branding to Karla's pale colour to test contrast logic
        await page.evaluate(function () {
          var appbar = document.getElementById('oob-appbar');
          if (!appbar) return;
          var ink = window.OOBContrast ? window.OOBContrast.textColour('#d1bdbd') : { colour: '#000000' };
          var isDark = ink.colour === '#FFFFFF';
          var brandInk = isDark ? '#FFFFFF' : '#1B2430';
          appbar.style.background = '#d1bdbd';
          appbar.style.setProperty('--brand-ink', brandInk);
          appbar.style.setProperty('--brand-overlay', isDark ? 'rgba(255,255,255,.14)' : 'rgba(27,36,48,.10)');
          appbar.style.setProperty('--brand-border', isDark ? 'rgba(255,255,255,.35)' : 'rgba(27,36,48,.25)');
          // Update name display
          var nameEl = document.getElementById('appbar-name');
          if (nameEl) nameEl.textContent = 'Karla Wentworth';
          var markEl = document.getElementById('appbar-mark');
          if (markEl) markEl.style.display = 'none';
        });
        await sleep(500);
        var bg = await page.evaluate(function () {
          return getComputedStyle(document.getElementById('oob-appbar')).backgroundColor;
        });
        console.log('  ' + width + 'px appbar bg: ' + bg);
        await page.screenshot({ path: SHOT_DIR + '/' + filename, clip: { x: 0, y: 0, width: width, height: clipH } });
        step(filename + ' saved', true);
        await ctx.close();
      }

      await takeAppbarShot(390, 844, 'appbar-karla-390.png', 56);
      await takeAppbarShot(1280, 800, 'appbar-karla-1280.png', 80);
    } else {
      step('Appbar screenshots', false, 'could not get session');
    }

    // ── 2. Sign-in error sentence test ────────────────────────────
    console.log('\n--- Sign-in error sentence test ---');
    var ctxErr = await browser.newContext({ viewport: { width: 390, height: 844 } });
    var pageErr = await ctxErr.newPage();
    pageErr.on('pageerror', function (err) { console.log('  PAGE ERROR: ' + err.message); });

    await pageErr.goto(BRANCH_URL + '/o/', { waitUntil: 'networkidle', timeout: 45000 });
    // Wait for sign-in screen
    await pageErr.waitForSelector('#screen-signin.active', { timeout: 15000 });

    // Show email form
    await pageErr.locator('button[onclick="showEmailSignIn()"]').click({ timeout: 5000 });
    await sleep(500);

    // Enter reviewer email
    await pageErr.locator('#magic-email').fill('review@outofboundsevents.com');
    await sleep(800);

    // Wait for code field to appear
    await pageErr.waitForSelector('#reviewer-code-row:not([style*="display:none"])', { timeout: 3000 });
    await pageErr.locator('#reviewer-code').fill('000000');
    await sleep(300);

    // Submit
    await pageErr.locator('#magic-btn').click();
    await sleep(5000);

    // Check error sentence
    var errResult = await pageErr.evaluate(function () {
      var el = document.getElementById('signin-error');
      if (!el) return { visible: false, text: '' };
      return {
        visible: el.offsetHeight > 0 && el.style.display !== 'none',
        text: el.textContent
      };
    });

    step('Error sentence visible', errResult.visible, 'text="' + errResult.text + '"');
    step('Error sentence has content', errResult.text.length > 10, 'length=' + errResult.text.length);

    // Screenshot
    await pageErr.screenshot({ path: SHOT_DIR + '/signin-error-390.png' });
    step('signin-error-390.png saved', true);

    await ctxErr.close();

  } finally {
    await browser.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
