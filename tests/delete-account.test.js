// delete-account.test.js — E2E test: Delete my account
// Run: SUPABASE_SERVICE_KEY=xxx node tests/delete-account.test.js [--url <base>]
// Seeds a throwaway org, gets a session, calls account-delete, verifies cleanup.

'use strict';

var https = require('https');

var args = process.argv.slice(2);
var urlFlag = args.indexOf('--url');
var LIVE_URL = urlFlag !== -1 && args[urlFlag + 1] ? args[urlFlag + 1] : 'https://outofboundsscoring.netlify.app';
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY = process.env.SUPABASE_SERVICE_KEY;

var TEST_EMAIL = 'delete-test-' + Date.now() + '@oob-test.com';
var TEST_USER_ID = null;
var TEST_ORG_ID = null;

var passed = 0;
var failed = 0;

function step(label, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else    { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

function request(hostname, method, path, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    var opts = { hostname: hostname, port: 443, path: path, method: method, headers: h };
    var timer = setTimeout(function () { reject(new Error('Timeout ' + path)); }, 12000);
    var req = https.request(opts, function (res) {
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(c).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', function (e) { clearTimeout(timer); reject(e); });
    if (payload) req.write(payload);
    req.end();
  });
}

var sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Prefer': 'return=representation' };
function sbRest(m, p, b) { return request(SB_HOST, m, '/rest/v1/' + p, b, sbHeaders); }
function sbAuth(m, p, b) { return request(SB_HOST, m, '/auth/v1/' + p, b, { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }); }

async function main() {
  console.log('=== Delete Account E2E Test ===');
  console.log('Target: ' + LIVE_URL);

  if (!SB_KEY) { console.error('FATAL: SUPABASE_SERVICE_KEY not set.'); process.exit(1); }

  try {
    // 1. Create auth user
    var u = await sbAuth('POST', 'admin/users', { email: TEST_EMAIL, email_confirm: true, password: 'TestDelete123!' });
    step('Create auth user', u.status === 200 && u.data && !!u.data.id, 'email=' + TEST_EMAIL);
    if (!u.data || !u.data.id) throw new Error('User creation failed');
    TEST_USER_ID = u.data.id;

    // 2. Create organiser
    var slug = 'deltest' + Math.random().toString(36).slice(2, 8);
    var o = await sbRest('POST', 'organisers', { auth_user_id: TEST_USER_ID, name: 'Delete Test', slug: slug, plan: 'per_event', plan_source: 'comp' });
    step('Create organiser', o.status === 201 && o.data && o.data.length > 0, 'slug=' + slug);
    if (!o.data || !o.data.length) throw new Error('Org creation failed: ' + o.status + ' ' + JSON.stringify(o.data).slice(0, 200));
    TEST_ORG_ID = o.data[0].id;

    // 3. Get session via password login
    var signIn = await sbAuth('POST', 'token?grant_type=password', { email: TEST_EMAIL, password: 'TestDelete123!' });
    var token = signIn.data && signIn.data.access_token;
    step('Get session token', !!token);
    if (!token) throw new Error('No token');

    // 4. Call account-delete handler directly (uses local SUPABASE_SERVICE_KEY)
    var handler = require('../netlify/functions/account-delete').handler;
    var handlerResult = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ auth_token: token }) });
    var del = { status: handlerResult.statusCode, data: JSON.parse(handlerResult.body) };
    step('account-delete returns ok', del.status === 200 && del.data && del.data.ok,
      'status=' + del.status + ' body=' + JSON.stringify(del.data).slice(0, 100));

    // 5. Organiser row gone
    var orgCheck = await sbRest('GET', 'organisers?id=eq.' + TEST_ORG_ID + '&select=id');
    step('Organiser row deleted from database', orgCheck.data && orgCheck.data.length === 0);

    // 6. Auth user gone
    var userCheck = await sbAuth('GET', 'admin/users/' + TEST_USER_ID);
    var gone = userCheck.status === 404 || (userCheck.data && userCheck.data.msg === 'User not found');
    step('Auth user deleted from Supabase', gone, 'status=' + userCheck.status);

  } catch (err) {
    step('Unexpected error', false, err.message);
  }

  // Safety cleanup
  try {
    if (TEST_ORG_ID) { await sbRest('DELETE', 'organisers?id=eq.' + TEST_ORG_ID); }
    if (TEST_USER_ID) { await sbAuth('DELETE', 'admin/users/' + TEST_USER_ID).catch(function () {}); }
  } catch (e) {}

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + (passed + failed) + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

main();
