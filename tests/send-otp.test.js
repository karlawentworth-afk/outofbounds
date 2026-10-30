// send-otp.test.js — Test origin-aware OTP sign-in
// Run: node tests/send-otp.test.js
// Requires: playwright

'use strict';

var https = require('https');
var { chromium } = require('playwright');

var BRANCH_URL = 'https://design-system--outofboundsscoring.netlify.app';

var passed = 0;
var failed = 0;
var total  = 0;

function step(label, ok, detail) {
  total++;
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else    { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

function callSendOtp(url, email, origin) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ email: email });
    var parsed = new URL(url + '/.netlify/functions/send-otp');
    var req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Origin': origin
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== send-otp origin validation tests ===\n');

  // Test 1: Branch deploy origin is used when valid
  var testEmail = 'otp-test-' + Date.now() + '@oob-test.local';
  var res1 = await callSendOtp(BRANCH_URL, testEmail, BRANCH_URL);
  step('Branch origin accepted', res1.status === 200 && res1.data.ok === true, 'status=' + res1.status);
  step('Resolved origin is branch URL', res1.data.origin === BRANCH_URL, 'origin=' + res1.data.origin);
  step('Redirect URL starts with branch URL', (res1.data.redirectTo || '').startsWith(BRANCH_URL), 'redirectTo=' + res1.data.redirectTo);

  // Test 2: Production origin is accepted
  var testEmail2 = 'otp-test2-' + Date.now() + '@oob-test.local';
  var res2 = await callSendOtp(BRANCH_URL, testEmail2, 'https://outofboundsevents.com');
  step('Production origin accepted', res2.status === 200 && res2.data.ok === true);
  step('Resolved origin is production', res2.data.origin === 'https://outofboundsevents.com', 'origin=' + res2.data.origin);

  // Test 3: Invalid origin falls back to DEPLOY_PRIME_URL or production
  var testEmail3 = 'otp-test3-' + Date.now() + '@oob-test.local';
  var res3 = await callSendOtp(BRANCH_URL, testEmail3, 'https://evil.example.com');
  step('Invalid origin rejected (fallback used)', res3.status === 200 && res3.data.ok === true);
  step('Fallback origin is not evil.example.com', res3.data.origin !== 'https://evil.example.com', 'origin=' + res3.data.origin);

  // Test 4: Missing email returns 400
  var res4 = await callSendOtp(BRANCH_URL, '', BRANCH_URL);
  step('Missing email returns error', res4.status === 400, 'status=' + res4.status);

  // Test 5: Browser test — sign-in page loads and shows email form
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BRANCH_URL + '/o/', { waitUntil: 'networkidle' });

  var signinVisible = await page.isVisible('#screen-signin');
  step('Sign-in screen visible', signinVisible);

  // Click "Continue with email"
  await page.click('text=Continue with email');
  var emailVisible = await page.isVisible('#magic-email');
  step('Email field visible after click', emailVisible);

  // Check hero has background image
  var heroBg = await page.evaluate(function () {
    var hero = document.querySelector('.auth .hero');
    return hero ? getComputedStyle(hero).backgroundImage : '';
  });
  step('Hero has course photo background', heroBg.includes('course-wide.jpg'), 'bg=' + heroBg.substring(0, 80));

  await browser.close();

  // Test: SMTP canary — non-member address via send-otp
  // Supabase built-in email only delivers to known users.
  // This test PASSes when the request is accepted (custom SMTP configured)
  // and FAILs with a message when Supabase rejects it (built-in SMTP only).
  var canaryEmail = 'oob-test-nonmember@mailinator.com';
  var canaryRes = await callSendOtp(BRANCH_URL, canaryEmail, BRANCH_URL);
  if (canaryRes.status === 200 && canaryRes.data.ok === true) {
    step('SMTP canary: non-member OTP accepted', true, 'custom SMTP is working');
  } else {
    step('SMTP canary: non-member OTP accepted', false,
      'Built-in Supabase email in use, custom SMTP not configured (status=' + canaryRes.status + ')');
  }

  console.log('\n' + passed + '/' + total + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
});
