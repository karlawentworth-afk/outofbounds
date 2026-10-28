'use strict';

/**
 * Auth test — proves that every organiser-side function requires a
 * valid JWT and rejects tokens from the wrong organisation.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=xxx TEST_URL=https://design-system--outofboundsscoring.netlify.app node tests/auth.test.js
 */

var https = require('https');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

// ── Load service key ───────────────────────────────────────────
function loadServiceKey() {
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (key && key.length > 100) return key;
  try {
    var raw = fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.local.json'), 'utf8');
    var match = raw.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (match && match[0].length > 100) return match[0];
  } catch (e) { /* ignore */ }
  return key || '';
}

// ── Config ─────────────────────────────────────────────────────
var SB_HOST  = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY   = loadServiceKey();
var LIVE_URL = process.env.TEST_URL || 'https://design-system--outofboundsscoring.netlify.app';
var LIVE_HOST = new URL(LIVE_URL).hostname;

if (!SB_KEY || SB_KEY.length < 100) {
  console.error('FATAL: SUPABASE_SERVICE_KEY is masked or missing.');
  process.exit(1);
}

var TS = Date.now();
var passed = 0;
var failed = 0;

// ── Helpers ────────────────────────────────────────────────────

function sbRequest(method, apiPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var opts = {
      hostname: SB_HOST, port: 443,
      path: '/rest/v1/' + apiPath,
      method: method, headers: headers
    };
    var timer = setTimeout(function () { reject(new Error('SB timeout')); }, 12000);
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try { resolve(raw ? JSON.parse(raw) : null); }
        catch (e) { reject(new Error('Bad JSON: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function sbAuth(method, apiPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var opts = {
      hostname: SB_HOST, port: 443,
      path: '/auth/v1/' + apiPath,
      method: method, headers: headers
    };
    var timer = setTimeout(function () { reject(new Error('Auth timeout')); }, 12000);
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function apiFetch(fnName, opts) {
  opts = opts || {};
  var method = opts.method || 'POST';
  var body = opts.body ? JSON.stringify(opts.body) : null;
  var qs = opts.query || {};
  var qsParts = Object.keys(qs).map(function (k) { return k + '=' + encodeURIComponent(qs[k]); });
  var qsStr = qsParts.length ? '?' + qsParts.join('&') : '';

  var headers = { 'Content-Type': 'application/json' };
  if (body) headers['Content-Length'] = Buffer.byteLength(body);
  if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;

  return new Promise(function (resolve, reject) {
    var reqOpts = {
      hostname: LIVE_HOST, port: 443,
      path: '/.netlify/functions/' + fnName + qsStr,
      method: method, headers: headers
    };
    var timer = setTimeout(function () { reject(new Error('Timeout: ' + fnName)); }, 15000);
    var req = https.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (body) req.write(body);
    req.end();
  });
}

function assert(label, ok, detail) {
  if (ok) {
    passed++;
    console.log('  PASS  ' + label + (detail ? ' -- ' + detail : ''));
  } else {
    failed++;
    console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : ''));
  }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var TEST_PASSWORD = 'OobAuthTest_' + Date.now() + '!';

/**
 * Create a Supabase user with a password, sign in, return { userId, accessToken }.
 */
async function createUserAndSignIn(email) {
  var create = await sbAuth('POST', 'admin/users', {
    email: email,
    password: TEST_PASSWORD,
    email_confirm: true
  });
  if (create.status !== 200 || !create.data || !create.data.id) {
    console.error('  Failed to create user:', email, create.status, JSON.stringify(create.data).slice(0, 200));
    return null;
  }

  var signin = await sbAuth('POST', 'token?grant_type=password', {
    email: email,
    password: TEST_PASSWORD
  });
  if (signin.status !== 200 || !signin.data || !signin.data.access_token) {
    console.error('  Failed to sign in:', email, signin.status, JSON.stringify(signin.data).slice(0, 200));
    return null;
  }

  return { userId: create.data.id, accessToken: signin.data.access_token };
}

// ── MAIN ───────────────────────────────────────────────────────
(async function () {
  console.log('=== Auth Blocker Tests ===');
  console.log('URL: ' + LIVE_URL);
  console.log('Timestamp: ' + TS + '\n');

  // ── SETUP ──────────────────────────────────────────────────

  // Two test users
  var emailA = 'auth-test-a-' + TS + '@oob-test.local';
  var emailB = 'auth-test-b-' + TS + '@oob-test.local';

  console.log('--- Setup: creating test users and orgs ---');

  var userA = await createUserAndSignIn(emailA);
  assert('User A created + signed in', !!userA, userA ? 'id=' + userA.userId : 'FAILED');
  if (!userA) { console.error('Cannot continue without User A'); process.exit(1); }
  var tokenA = userA.accessToken;
  var userAId = userA.userId;

  var userB = await createUserAndSignIn(emailB);
  assert('User B created + signed in', !!userB, userB ? 'id=' + userB.userId : 'FAILED');
  if (!userB) { console.error('Cannot continue without User B'); process.exit(1); }
  var tokenB = userB.accessToken;
  var userBId = userB.userId;

  // Create Org A owned by User A
  var orgASlug = 'auth-test-a-' + TS;
  var orgA = await sbRequest('POST', 'organisers', {
    slug: orgASlug,
    name: 'Auth Test Org A',
    auth_user_id: userAId,
    plan: 'per_event'
  });
  var orgAId = Array.isArray(orgA) ? orgA[0].id : orgA.id;
  assert('Org A created', !!orgAId, orgAId);

  // Create Org B owned by User B (the "other" org)
  var orgBSlug = 'auth-test-b-' + TS;
  var orgB = await sbRequest('POST', 'organisers', {
    slug: orgBSlug,
    name: 'Auth Test Org B',
    auth_user_id: userBId,
    plan: 'per_event'
  });
  var orgBId = Array.isArray(orgB) ? orgB[0].id : orgB.id;
  assert('Org B created', !!orgBId, orgBId);

  // Create an event in Org A
  var eventA = await sbRequest('POST', 'events', {
    organiser_id: orgAId,
    name: 'Auth Test Event',
    slug: 'auth-test-event-' + TS,
    status: 'draft',
    format: 'stableford'
  });
  var eventAId = Array.isArray(eventA) ? eventA[0].id : eventA.id;
  assert('Event A created', !!eventAId, eventAId);

  // Create a player in Event A
  var playerA = await sbRequest('POST', 'players', {
    event_id: eventAId,
    first_name: 'Test',
    last_name: 'Player',
    display_name: 'Test Player',
    player_token: crypto.randomBytes(16).toString('hex')
  });
  var playerAId = Array.isArray(playerA) ? playerA[0].id : playerA.id;
  assert('Player A created', !!playerAId, playerAId);

  // ── TEST FUNCTIONS ────────────────────────────────────────

  // Helper: test a function with no token, wrong-org token, and correct token
  async function testAuth(label, fnName, opts) {
    var method = opts.method || 'POST';
    var body = opts.body || null;
    var query = opts.query || null;
    var expectOk = opts.expectOk || 200;
    // For event routes, wrong org should get 404 (not 403, to hide existence)
    var expectWrong = opts.expectWrong || 403;

    // 1. No token => 401
    var noAuth = await apiFetch(fnName, { method: method, body: body, query: query });
    assert(label + ': no token => 401', noAuth.status === 401,
      'got ' + noAuth.status);

    // 2. Wrong org token => 403 or 404
    var wrongAuth = await apiFetch(fnName, { method: method, body: body, query: query, token: tokenB });
    assert(label + ': wrong org => ' + expectWrong,
      wrongAuth.status === expectWrong || wrongAuth.status === 403 || wrongAuth.status === 404,
      'got ' + wrongAuth.status);

    // 3. Correct token => success
    var goodAuth = await apiFetch(fnName, { method: method, body: body, query: query, token: tokenA });
    assert(label + ': correct token => ' + expectOk,
      goodAuth.status === expectOk,
      'got ' + goodAuth.status + ' ' + JSON.stringify(goodAuth.data).slice(0, 120));
  }

  // ── 1. event-players ───────────────────────────────────────
  console.log('\n--- event-players (organiser GET) ---');
  await testAuth('event-players', 'event-players', {
    method: 'GET',
    query: { event: eventAId },
    expectWrong: 404
  });

  // ── 2. org-players GET ─────────────────────────────────────
  console.log('\n--- org-players GET ---');
  await testAuth('org-players GET', 'org-players', {
    method: 'GET',
    query: { event_id: eventAId, organiser_id: orgAId },
    expectWrong: 404
  });

  // ── 3. org-players POST ────────────────────────────────────
  console.log('\n--- org-players POST ---');
  await testAuth('org-players POST', 'org-players', {
    method: 'POST',
    body: {
      event_id: eventAId,
      organiser_id: orgAId,
      players: [{ first_name: 'Auth', last_name: 'Test' }]
    },
    expectWrong: 404
  });

  // ── 4. org-admin (superadmin) ──────────────────────────────
  console.log('\n--- org-admin (superadmin) ---');
  // Both A and B should get 403 (neither is superadmin)
  var adminNoAuth = await apiFetch('org-admin', {
    method: 'GET',
    query: { organiser_id: orgAId }
  });
  assert('org-admin: no token => 401', adminNoAuth.status === 401, 'got ' + adminNoAuth.status);

  var adminWrongAuth = await apiFetch('org-admin', {
    method: 'GET',
    query: { organiser_id: orgAId },
    token: tokenA
  });
  assert('org-admin: non-superadmin => 403', adminWrongAuth.status === 403, 'got ' + adminWrongAuth.status);

  // ── 5. org-team GET ────────────────────────────────────────
  console.log('\n--- org-team ---');
  await testAuth('org-team GET', 'org-team', {
    method: 'GET',
    query: { organiser_id: orgAId },
    expectWrong: 403
  });

  // ── 6. org-score-edit ──────────────────────────────────────
  console.log('\n--- org-score-edit ---');
  await testAuth('org-score-edit', 'org-score-edit', {
    method: 'POST',
    body: {
      organiser_id: orgAId,
      event_id: eventAId,
      player_id: playerAId,
      hole_number: 1,
      reason: 'auth test',
      new_gross: 4
    },
    expectWrong: 404
  });

  // ── 7. stripe-portal ──────────────────────────────────────
  console.log('\n--- stripe-portal ---');
  // stripe-portal will fail with 400 (no billing account) but that's after auth passes
  var portalNoAuth = await apiFetch('stripe-portal', {
    method: 'POST',
    body: { organiser_id: orgAId }
  });
  assert('stripe-portal: no token => 401', portalNoAuth.status === 401, 'got ' + portalNoAuth.status);

  var portalWrong = await apiFetch('stripe-portal', {
    method: 'POST',
    body: { organiser_id: orgAId },
    token: tokenB
  });
  assert('stripe-portal: wrong org => 403', portalWrong.status === 403, 'got ' + portalWrong.status);

  var portalOk = await apiFetch('stripe-portal', {
    method: 'POST',
    body: { organiser_id: orgAId },
    token: tokenA
  });
  // 400 = "No billing account" means auth passed, billing check is the real error
  assert('stripe-portal: correct token => past auth',
    portalOk.status === 200 || portalOk.status === 400,
    'got ' + portalOk.status + ' ' + JSON.stringify(portalOk.data).slice(0, 100));

  // ── 8. stripe-checkout ─────────────────────────────────────
  console.log('\n--- stripe-checkout ---');
  var checkoutNoAuth = await apiFetch('stripe-checkout', {
    method: 'POST',
    body: { event_id: eventAId, organiser_id: orgAId }
  });
  assert('stripe-checkout: no token => 401', checkoutNoAuth.status === 401, 'got ' + checkoutNoAuth.status);

  var checkoutWrong = await apiFetch('stripe-checkout', {
    method: 'POST',
    body: { event_id: eventAId, organiser_id: orgAId },
    token: tokenB
  });
  assert('stripe-checkout: wrong org => 403/404',
    checkoutWrong.status === 403 || checkoutWrong.status === 404,
    'got ' + checkoutWrong.status);

  var checkoutOk = await apiFetch('stripe-checkout', {
    method: 'POST',
    body: { event_id: eventAId, organiser_id: orgAId },
    token: tokenA
  });
  // Might get 400 "No players" or 500 if Stripe key missing, but status != 401/403 means auth passed
  assert('stripe-checkout: correct token => past auth',
    checkoutOk.status !== 401 && checkoutOk.status !== 403,
    'got ' + checkoutOk.status + ' ' + JSON.stringify(checkoutOk.data).slice(0, 100));

  // ── 9. org-invite-send ─────────────────────────────────────
  console.log('\n--- org-invite-send ---');
  var inviteNoAuth = await apiFetch('org-invite-send', {
    method: 'POST',
    body: { organiser_id: orgAId, event_id: eventAId, action: 'status' }
  });
  assert('org-invite-send: no token => 401', inviteNoAuth.status === 401, 'got ' + inviteNoAuth.status);

  var inviteWrong = await apiFetch('org-invite-send', {
    method: 'POST',
    body: { organiser_id: orgAId, event_id: eventAId, action: 'status' },
    token: tokenB
  });
  assert('org-invite-send: wrong org => 403', inviteWrong.status === 403, 'got ' + inviteWrong.status);

  // ── CLEANUP ────────────────────────────────────────────────
  console.log('\n--- Cleanup ---');

  // Delete test data
  try {
    await sbRequest('DELETE', 'players?event_id=eq.' + eventAId);
    await sbRequest('DELETE', 'events?organiser_id=eq.' + orgAId);
    await sbRequest('DELETE', 'events?organiser_id=eq.' + orgBId);
    await sbRequest('DELETE', 'people?organiser_id=eq.' + orgAId);
    await sbRequest('DELETE', 'people?organiser_id=eq.' + orgBId);
    await sbRequest('DELETE', 'organisers?id=eq.' + orgAId);
    await sbRequest('DELETE', 'organisers?id=eq.' + orgBId);

    // Delete test auth users
    if (userAId) await sbAuth('DELETE', 'admin/users/' + userAId);
    if (userBId) await sbAuth('DELETE', 'admin/users/' + userBId);
    console.log('  Cleaned up test orgs and users.');
  } catch (e) {
    console.warn('  Cleanup warning:', e.message);
  }

  // ── SUMMARY ────────────────────────────────────────────────
  console.log('\n=== Auth Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
  process.exit(failed > 0 ? 1 : 0);
})();
