// delete-account.test.js — Playwright test: Delete my account flow
// Run: SUPABASE_SERVICE_KEY=xxx node tests/delete-account.test.js
// Or:  node tests/delete-account.test.js --url https://store-live--outofboundsscoring.netlify.app
// Seeds a throwaway test org via Supabase Admin API, signs in, deletes, verifies cleanup.
// Falls back to sign-up flow if no SUPABASE_SERVICE_KEY is set.

'use strict';

var https = require('https');
var { chromium } = require('playwright');

// ── Constants ────────────────────────────────────────────────────
var args = process.argv.slice(2);
var urlArg = args.indexOf('--url');
var LIVE_URL = urlArg !== -1 && args[urlArg + 1] ? args[urlArg + 1] : 'https://outofboundsscoring.netlify.app';
var SB_HOST  = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY   = process.env.SUPABASE_SERVICE_KEY;
var SB_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';

var TEST_EMAIL = 'delete-test-' + Date.now() + '@oob-test.local';
var TEST_ORG_ID = null;
var TEST_USER_ID = null;

// ── Counters ────────────────────────────────────────────────────
var passed = 0;
var failed = 0;
var total  = 0;

function step(label, ok, detail) {
  total++;
  if (ok) {
    passed++;
    console.log('  PASS  ' + label + (detail ? ' — ' + detail : ''));
  } else {
    failed++;
    console.error('  FAIL  ' + label + (detail ? ' — ' + detail : ''));
  }
}

// ── HTTP helpers ────────────────────────────────────────────────

function sbRequest(method, basePath, path, body, authKey) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': authKey,
      'Authorization': 'Bearer ' + authKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var reqOpts = {
      hostname: SB_HOST,
      port: 443,
      path: basePath + path,
      method: method,
      headers: headers
    };

    var timer = setTimeout(function () { reject(new Error('Timeout ' + method + ' ' + path)); }, 12000);
    var req = https.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function sbRest(method, path, body) { return sbRequest(method, '/rest/v1/', path, body, SB_KEY); }
function sbAuth(method, path, body) { return sbRequest(method, '/auth/v1/', path, body, SB_KEY); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── Seed (admin API) ────────────────────────────────────────────

async function seed() {
  console.log('\n--- Seed test user and organiser ---');

  var userRes = await sbAuth('POST', 'admin/users', {
    email: TEST_EMAIL,
    email_confirm: true,
    password: 'TestDelete123!'
  });
  step('Create auth user', userRes.status === 200 && userRes.data && userRes.data.id, 'email=' + TEST_EMAIL);
  if (!userRes.data || !userRes.data.id) return false;
  TEST_USER_ID = userRes.data.id;

  var orgSlug = 'delete-test-' + Date.now();
  var orgRes = await sbRest('POST', 'organisers', {
    auth_user_id: TEST_USER_ID,
    name: 'Delete Test Org',
    slug: orgSlug,
    plan: 'play',
    plan_source: 'comp'
  });
  step('Create organiser', orgRes.status === 201 && orgRes.data && orgRes.data.length > 0, 'slug=' + orgSlug);
  if (!orgRes.data || !orgRes.data.length) return false;
  TEST_ORG_ID = orgRes.data[0].id;

  return true;
}

// ── Get session token ───────────────────────────────────────────

async function getSessionToken() {
  var linkRes = await sbAuth('POST', 'admin/generate_link', {
    type: 'magiclink',
    email: TEST_EMAIL
  });

  var accessToken = null;
  var hashedToken = linkRes.data && linkRes.data.properties && linkRes.data.properties.hashed_token;
  var actionLink = linkRes.data && linkRes.data.action_link || '';
  var urlMatch = actionLink.match(/[?&]token=([^&#]+)/);
  var otp = urlMatch ? decodeURIComponent(urlMatch[1]) : null;

  if (otp) {
    var v = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: otp });
    if (v.status === 200 && v.data) accessToken = v.data.access_token;
  }
  if (!accessToken && hashedToken) {
    var v2 = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: hashedToken });
    if (v2.status === 200 && v2.data) accessToken = v2.data.access_token;
  }
  if (!accessToken) accessToken = linkRes.data && linkRes.data.access_token;

  return accessToken;
}

// ── Browser test ────────────────────────────────────────────────

async function testDeleteAccount(accessToken) {
  console.log('\n--- Delete my account (browser) ---');

  step('Get session token', !!accessToken);
  if (!accessToken) return;

  var browser = await chromium.launch({ headless: true });
  var context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var page = await context.newPage();

  try {
    await page.goto(LIVE_URL + '/o/', { waitUntil: 'networkidle', timeout: 20000 });

    // Set the Supabase session
    await page.evaluate(function (data) {
      var sb = window.supabase.createClient(data.url, data.anon);
      return sb.auth.setSession({ access_token: data.token, refresh_token: '' });
    }, { url: 'https://' + SB_HOST, anon: SB_ANON, token: accessToken });

    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    await sleep(3000);

    // Navigate to Settings
    var gearClicked = false;
    var settingsLocators = [
      page.locator('[onclick*="goToSettings"]').first(),
      page.locator('button:has-text("Settings")').first(),
      page.locator('text=Settings').first()
    ];

    for (var i = 0; i < settingsLocators.length; i++) {
      if (await settingsLocators[i].isVisible({ timeout: 2000 }).catch(function () { return false; })) {
        await settingsLocators[i].click();
        gearClicked = true;
        break;
      }
    }

    step('Navigate to Settings', gearClicked);
    if (!gearClicked) { await browser.close(); return; }
    await sleep(1500);

    // Find and click "Delete my account"
    var deleteBtn = page.locator('[onclick*="deleteAccount"]').first();
    var deleteVisible = await deleteBtn.isVisible({ timeout: 5000 }).catch(function () { return false; });
    step('Delete button visible in Settings', deleteVisible);
    if (!deleteVisible) { await browser.close(); return; }

    await deleteBtn.click();
    await sleep(1000);

    // Type DELETE in the oobPrompt
    var promptInput = page.locator('#oob-prompt-input, .oob-modal input[type="text"]').first();
    var promptVisible = await promptInput.isVisible({ timeout: 5000 }).catch(function () { return false; });
    step('Confirmation prompt with text input appeared', promptVisible);
    if (!promptVisible) { await browser.close(); return; }

    await promptInput.fill('DELETE');
    await sleep(300);

    // Click confirm
    var confirmBtn = page.locator('#oob-prompt-ok, .oob-modal button').last();
    await confirmBtn.click();
    await sleep(4000);

    // Should be back on sign-in screen
    var signinVisible = await page.locator('#screen-signin.active').count();
    step('Returned to sign-in screen after deletion', signinVisible > 0);

  } finally {
    await browser.close();
  }
}

// ── Verify cleanup ──────────────────────────────────────────────

async function verifyDeleted() {
  console.log('\n--- Verify database cleanup ---');

  var orgCheck = await sbRest('GET', 'organisers?id=eq.' + TEST_ORG_ID + '&select=id');
  var orgGone = orgCheck.data && orgCheck.data.length === 0;
  step('Organiser row deleted from database', orgGone, orgGone ? 'confirmed' : 'still exists');

  var userCheck = await sbAuth('GET', 'admin/users/' + TEST_USER_ID);
  var userGone = userCheck.status === 404 || (userCheck.data && userCheck.data.code === 'user_not_found');
  step('Auth user deleted from Supabase', userGone, userGone ? 'confirmed' : 'status=' + userCheck.status);
}

// ── Cleanup (safety net) ────────────────────────────────────────

async function cleanup() {
  if (!SB_KEY) return;
  console.log('\n--- Cleanup (safety net) ---');
  try {
    if (TEST_ORG_ID) {
      await sbRest('DELETE', 'events?organiser_id=eq.' + TEST_ORG_ID);
      await sbRest('DELETE', 'people?organiser_id=eq.' + TEST_ORG_ID);
      await sbRest('DELETE', 'organisers?id=eq.' + TEST_ORG_ID);
    }
    if (TEST_USER_ID) {
      await sbAuth('DELETE', 'admin/users/' + TEST_USER_ID).catch(function () {});
    }
    console.log('  Cleanup complete.');
  } catch (err) {
    console.error('  Cleanup error:', err.message);
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('=== Delete Account E2E Test ===');
  console.log('Target: ' + LIVE_URL);

  if (!SB_KEY) {
    console.error('FATAL: SUPABASE_SERVICE_KEY env var not set.');
    console.error('Run: SUPABASE_SERVICE_KEY=xxx node tests/delete-account.test.js');
    process.exit(1);
  }

  try {
    var seeded = await seed();
    if (!seeded) {
      console.error('Seed failed.');
      await cleanup();
      process.exit(1);
    }

    var token = await getSessionToken();
    await testDeleteAccount(token);
    await verifyDeleted();
  } catch (err) {
    console.error('\n!!! Unexpected error: ' + err.message);
    console.error(err.stack);
  }

  await cleanup();

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + total + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

main();
