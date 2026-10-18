// delete-account.test.js — Playwright test: Delete my account flow
// Run: node tests/delete-account.test.js
// Requires: SUPABASE_SERVICE_KEY env var
// Seeds a throwaway test org, signs in, deletes the account, verifies cleanup.

'use strict';

var https = require('https');
var { chromium } = require('playwright');

// ── Constants ────────────────────────────────────────────────────
var LIVE_URL = 'https://outofboundsscoring.netlify.app';
var SB_HOST  = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY   = process.env.SUPABASE_SERVICE_KEY;

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

function sbRest(method, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var reqOpts = {
      hostname: SB_HOST,
      port: 443,
      path: '/rest/v1/' + path,
      method: method,
      headers: headers
    };

    var timer = setTimeout(function () { reject(new Error('Timeout SB ' + method + ' ' + path)); }, 12000);

    var req = https.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function sbAuth(method, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var reqOpts = {
      hostname: SB_HOST,
      port: 443,
      path: '/auth/v1/' + path,
      method: method,
      headers: headers
    };

    var timer = setTimeout(function () { reject(new Error('Timeout auth ' + path)); }, 12000);

    var req = https.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── Seed ────────────────────────────────────────────────────────

async function seed() {
  console.log('\n--- Seed test user and organiser ---');

  // Create auth user
  var userRes = await sbAuth('POST', 'admin/users', {
    email: TEST_EMAIL,
    email_confirm: true,
    password: 'TestDelete123!'
  });
  step('Create auth user', userRes.status === 200 && userRes.data && userRes.data.id, 'email=' + TEST_EMAIL);
  if (!userRes.data || !userRes.data.id) return false;
  TEST_USER_ID = userRes.data.id;

  // Create organiser row
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

// ── Browser test ────────────────────────────────────────────────

async function testDeleteAccount() {
  console.log('\n--- Delete my account (browser) ---');

  // Get a session token via magic link
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

  step('Get session token', !!accessToken);
  if (!accessToken) return;

  var browser = await chromium.launch({ headless: true });
  var context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var page = await context.newPage();

  try {
    // Navigate to /o/ and inject auth cookies
    await page.goto(LIVE_URL + '/o/', { waitUntil: 'networkidle', timeout: 15000 });

    // Set the Supabase session via JS
    await page.evaluate(function (token) {
      var SB_URL = 'https://ahutmswadskdkqhnrhhh.supabase.co';
      var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';
      var sb = window.supabase.createClient(SB_URL, SB_ANON);
      return sb.auth.setSession({ access_token: token, refresh_token: '' });
    }, accessToken);

    // Reload to pick up the session
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await sleep(2000);

    // Should be on dashboard now — look for Settings
    var settingsBtn = await page.locator('text=Settings').first();
    var hasDashboard = await settingsBtn.isVisible({ timeout: 8000 }).catch(function () { return false; });

    if (!hasDashboard) {
      // May need to wait for onboarding or try the gear icon
      // Check if we're on the onboard screen
      var onboard = await page.locator('#screen-onboard.active').count();
      if (onboard > 0) {
        // Fill minimal onboarding: org name
        var nameInput = page.locator('#onboard-name');
        if (await nameInput.isVisible({ timeout: 2000 }).catch(function () { return false; })) {
          await nameInput.fill('Delete Test Org');
          await page.locator('text=Next').first().click();
          await sleep(1000);
          // Skip remaining steps if possible
          var skipBtn = await page.locator('text=Skip').first();
          if (await skipBtn.isVisible({ timeout: 1000 }).catch(function () { return false; })) {
            await skipBtn.click();
            await sleep(1000);
          }
        }
      }
      await sleep(2000);
    }

    // Navigate to Settings screen
    // The app may show settings via goToSettings() — click the settings row or button
    var gearClicked = false;

    // Try clicking a visible "Settings" text or gear icon
    var settingsLocators = [
      page.locator('button:has-text("Settings")').first(),
      page.locator('[onclick*="goToSettings"]').first(),
      page.locator('text=Settings').first()
    ];

    for (var i = 0; i < settingsLocators.length; i++) {
      var loc = settingsLocators[i];
      if (await loc.isVisible({ timeout: 1500 }).catch(function () { return false; })) {
        await loc.click();
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
    step('Delete button visible', deleteVisible);
    if (!deleteVisible) { await browser.close(); return; }

    await deleteBtn.click();
    await sleep(1000);

    // The oobPrompt modal should appear — find the input and type DELETE
    var promptInput = page.locator('.oob-modal input[type="text"], .oob-prompt input, .bottom-sheet input[type="text"]').first();
    var promptVisible = await promptInput.isVisible({ timeout: 5000 }).catch(function () { return false; });
    step('Confirmation prompt appeared', promptVisible);
    if (!promptVisible) { await browser.close(); return; }

    await promptInput.fill('DELETE');
    await sleep(300);

    // Click the confirm button in the modal
    var confirmBtn = page.locator('.oob-modal button:has-text("OK"), .oob-modal button:has-text("Confirm"), .oob-modal button:has-text("Delete"), .bottom-sheet button:has-text("OK")').first();
    if (!await confirmBtn.isVisible({ timeout: 2000 }).catch(function () { return false; })) {
      // Try any primary-looking button in the modal
      confirmBtn = page.locator('.oob-modal button').last();
    }
    await confirmBtn.click();
    await sleep(3000);

    // Should be back on sign-in screen
    var signinVisible = await page.locator('#screen-signin.active').count();
    step('Returned to sign-in screen', signinVisible > 0);

    // Check for "Account deleted" toast
    var toastText = await page.locator('.toast, [class*="toast"]').textContent({ timeout: 2000 }).catch(function () { return ''; });
    step('Toast says account deleted', toastText.toLowerCase().indexOf('deleted') !== -1, toastText);

  } finally {
    await browser.close();
  }
}

// ── Verify cleanup in database ──────────────────────────────────

async function verifyDeleted() {
  console.log('\n--- Verify database cleanup ---');

  // Organiser row should be gone
  var orgCheck = await sbRest('GET', 'organisers?id=eq.' + TEST_ORG_ID + '&select=id');
  var orgGone = orgCheck.data && orgCheck.data.length === 0;
  step('Organiser row deleted', orgGone, orgGone ? 'confirmed' : 'still exists');

  // Auth user should be gone
  var userCheck = await sbAuth('GET', 'admin/users/' + TEST_USER_ID);
  var userGone = userCheck.status === 404 || (userCheck.data && userCheck.data.code === 'user_not_found');
  step('Auth user deleted', userGone, userGone ? 'confirmed' : 'status=' + userCheck.status);
}

// ── Cleanup (safety net) ────────────────────────────────────────

async function cleanup() {
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
  console.log('');

  if (!SB_KEY) {
    console.error('FATAL: SUPABASE_SERVICE_KEY env var not set.');
    process.exit(1);
  }

  try {
    var seeded = await seed();
    if (!seeded) {
      console.error('Seed failed — aborting.');
      await cleanup();
      process.exit(1);
    }

    await testDeleteAccount();
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
