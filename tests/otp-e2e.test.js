'use strict';
// OTP end-to-end test: sign in via the UI, read code from mailinator.
// Sends a REAL email — run only when tagging or explicitly asked.
// Usage: OTP_E2E=1 TEST_URL=https://score.outofboundsevents.com node tests/otp-e2e.test.js
//
// Without OTP_E2E=1 the test exits 0 with a skip message.

if (!process.env.OTP_E2E) {
  console.log('OTP end-to-end test skipped (set OTP_E2E=1 to run)');
  process.exit(0);
}

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

if (!SB_KEY || SB_KEY.length < 100) {
  console.error('FATAL: SUPABASE_SERVICE_KEY is masked or missing.');
  process.exit(1);
}

var passed = 0, failed = 0, total = 0;
function step(label, ok, detail) {
  total++;
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function httpReq(method, hostname, reqPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : null;
    var h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    var req = https.request({ hostname: hostname, port: 443, path: reqPath, method: method, headers: h }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('=== OTP End-to-End Test ===');
  console.log('Target: ' + BASE);

  var ts = Date.now();
  var mailbox = 'oob-otp-' + ts;
  var email = mailbox + '@mailinator.com';

  var browser = await chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var page = await ctx.newPage();

  // 1. Load sign-in and enter email via the UI
  await page.goto(BASE + '/o/', { waitUntil: 'load', timeout: 30000 });
  for (var w = 0; w < 20; w++) {
    await sleep(500);
    var s = await page.evaluate(function () {
      var si = document.getElementById('screen-signin');
      return si && si.offsetHeight > 0 ? 'signin' : 'waiting';
    });
    if (s === 'signin') break;
  }
  step('Sign-in screen loaded', s === 'signin', 'screen=' + s);

  await page.locator('button:has-text("with email")').click();
  await sleep(500);
  await page.fill('#magic-email', email);
  await sleep(500);

  // 2. Click "Send me a code" — this calls send-otp
  await page.click('#magic-btn');

  // Wait for the OTP code field to appear (up to 30s for cold start)
  var otpVisible = false;
  for (var ow = 0; ow < 30; ow++) {
    await sleep(1000);
    otpVisible = await page.evaluate(function () {
      var el = document.getElementById('magic-sent');
      return el && el.offsetHeight > 0;
    });
    if (otpVisible) break;
  }
  step('Code field appears after send', otpVisible, 'visible=' + otpVisible);

  // 3. Read the code from mailinator (up to 3 minutes)
  var code = '';
  if (otpVisible) {
    console.log('  Waiting for email at ' + email + '...');
    for (var attempt = 0; attempt < 18; attempt++) {
      await sleep(10000);
      try {
        // Try Playwright to read mailinator
        var mailCtx = await browser.newContext();
        var mailPage = await mailCtx.newPage();
        await mailPage.goto('https://www.mailinator.com/v4/public/inboxes.jsp?to=' + mailbox, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        var hasMsg = await mailPage.evaluate(function () {
          var rows = document.querySelectorAll('tr.ng-scope');
          if (rows.length > 0) { rows[0].click(); return true; }
          return false;
        });
        if (hasMsg) {
          await sleep(3000);
          var emailBody = await mailPage.evaluate(function () {
            var iframe = document.getElementById('msg_body');
            if (iframe && iframe.contentDocument) return iframe.contentDocument.body.innerText;
            return document.body.innerText;
          });
          var cm = emailBody.match(/\b(\d{6})\b/);
          if (cm) {
            code = cm[1];
            await mailCtx.close();
            break;
          }
        }
        await mailCtx.close();
      } catch (e) { /* retry */ }
    }
    step('Email received with 6-digit code', code.length === 6, 'length=' + code.length);
  }

  // 4. Enter the code and sign in
  if (code) {
    await page.fill('#otp-code', code);
    await sleep(300);
    await page.click('#otp-verify-btn');

    var signedIn = false;
    for (var dw = 0; dw < 20; dw++) {
      await sleep(1000);
      var screen = await page.evaluate(function () {
        var dash = document.getElementById('screen-dashboard');
        var onboard = document.getElementById('screen-onboard');
        if (dash && dash.offsetHeight > 0) return 'dashboard';
        if (onboard && onboard.offsetHeight > 0) return 'onboard';
        return 'waiting';
      });
      if (screen === 'dashboard' || screen === 'onboard') { signedIn = true; break; }
    }
    step('Sign-in reached dashboard or onboard', signedIn, 'screen=' + screen);
  }

  await ctx.close();
  await browser.close();

  // Cleanup: delete the test user
  try {
    var users = await httpReq('GET', SB_HOST, '/auth/v1/admin/users?filter=' + encodeURIComponent(email),
      null, { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY });
    if (users.data && users.data.users) {
      for (var u = 0; u < users.data.users.length; u++) {
        if (users.data.users[u].email === email) {
          await httpReq('DELETE', SB_HOST, '/auth/v1/admin/users/' + users.data.users[u].id,
            null, { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY });
          console.log('  Cleaned up user ' + users.data.users[u].id);
        }
      }
    }
  } catch (e) { console.log('  Cleanup error: ' + e.message); }

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + total + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
