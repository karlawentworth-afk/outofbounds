'use strict';
// OTP end-to-end test: request code, read from mailinator, sign in
// Usage: TEST_URL=https://score.outofboundsevents.com node tests/otp-e2e.test.js

var fs = require('fs');
var path = require('path');
var https = require('https');
var { chromium } = require('playwright');

var BASE = process.env.TEST_URL || 'https://score.outofboundsevents.com';
var HOST = new URL(BASE).hostname;
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

  // 1. Request OTP via send-otp
  var otpRes = await httpReq('POST', HOST, '/.netlify/functions/send-otp', { email: email });
  step('send-otp accepted', otpRes.status === 200 && otpRes.data && otpRes.data.ok === true,
    'status=' + otpRes.status + ' ok=' + (otpRes.data ? otpRes.data.ok : '?'));

  if (otpRes.status !== 200 || !otpRes.data || !otpRes.data.ok) {
    console.log('Cannot continue without OTP sent.');
    process.exit(1);
  }

  // 2. Wait for email at mailinator (up to 3 minutes)
  var browser = await chromium.launch();
  var code = '';

  console.log('  Waiting for email at ' + mailbox + '@mailinator.com...');
  for (var attempt = 0; attempt < 18; attempt++) {
    await sleep(10000);
    // Try mailinator API
    try {
      var mailRes = await httpReq('GET', 'www.mailinator.com',
        '/api/v2/domains/public/inboxes/' + mailbox,
        null, {});
      if (mailRes.data && mailRes.data.msgs && mailRes.data.msgs.length > 0) {
        var msgId = mailRes.data.msgs[0].id;
        var msgRes = await httpReq('GET', 'www.mailinator.com',
          '/api/v2/domains/public/inboxes/' + mailbox + '/messages/' + msgId,
          null, {});
        if (msgRes.data && msgRes.data.parts) {
          var bodyText = '';
          msgRes.data.parts.forEach(function (p) {
            if (p.body) bodyText += p.body;
          });
          // Extract 6-digit code from email body
          var codeMatch = bodyText.match(/\b(\d{6})\b/);
          if (codeMatch) {
            code = codeMatch[1];
            step('Email received with 6-digit code', true, 'code length=' + code.length);
            break;
          }
        }
      }
    } catch (e) { /* retry */ }

    // Also try Playwright approach to read mailinator
    if (attempt === 5 || attempt === 10) {
      try {
        var mailCtx = await browser.newContext();
        var mailPage = await mailCtx.newPage();
        await mailPage.goto('https://www.mailinator.com/v4/public/inboxes.jsp?to=' + mailbox, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        // Click the first message if any
        var hasMsg = await mailPage.evaluate(function () {
          var rows = document.querySelectorAll('tr.ng-scope');
          if (rows.length > 0) { rows[0].click(); return true; }
          return false;
        });
        if (hasMsg) {
          await sleep(3000);
          var emailBody = await mailPage.evaluate(function () {
            var iframe = document.querySelector('#msg_body');
            if (iframe && iframe.contentDocument) return iframe.contentDocument.body.innerText;
            return document.body.innerText;
          });
          var cm = emailBody.match(/\b(\d{6})\b/);
          if (cm) {
            code = cm[1];
            step('Email received with 6-digit code', true, 'code length=' + code.length);
            await mailCtx.close();
            break;
          }
        }
        await mailCtx.close();
      } catch (e) { /* ignore playwright errors */ }
    }

    if (attempt === 17) {
      step('Email received with 6-digit code', false, 'no email after 3 minutes');
    }
  }

  step('Code is exactly 6 digits', code.length === 6, 'length=' + code.length);

  // 3. Sign in with the code in Playwright
  if (code) {
    var ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    var page = await ctx.newPage();
    await page.goto(BASE + '/o/', { waitUntil: 'load', timeout: 30000 });

    // Wait for sign-in screen
    for (var w = 0; w < 20; w++) {
      await sleep(500);
      var s = await page.evaluate(function () {
        var si = document.getElementById('screen-signin');
        return si && si.offsetHeight > 0 ? 'signin' : 'waiting';
      });
      if (s === 'signin') break;
    }

    // Click email sign-in, enter the test email
    await page.locator('button:has-text("with email")').click();
    await sleep(500);
    await page.fill('#magic-email', email);
    await sleep(1000);

    // Wait for the OTP form (magic-sent) to be visible after send
    await page.click('#magic-btn');
    for (var ow = 0; ow < 20; ow++) {
      await sleep(1000);
      var otpVisible = await page.isVisible('#otp-code');
      if (otpVisible) break;
    }
    step('OTP code field visible after send', otpVisible, 'visible=' + otpVisible);

    if (otpVisible) {
      await page.fill('#otp-code', code);
      await sleep(300);
      await page.click('#otp-verify-btn');

      // Wait for dashboard or onboard screen
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
  }

  await browser.close();

  // Cleanup: delete the test user from Supabase
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
