/**
 * test-delete-account — one-shot Netlify function that runs the
 * delete-account test server-side, where SUPABASE_SERVICE_KEY is available.
 *
 * POST /.netlify/functions/test-delete-account
 * Returns { passed, failed, total, steps[] }
 *
 * Remove this function after the test passes.
 */
'use strict';

var https = require('https');

var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbRequest(method, basePath, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var opts = { hostname: SB_HOST, port: 443, path: basePath + path, method: method, headers: headers };
    var timer = setTimeout(function () { reject(new Error('Timeout')); }, 12000);
    var req = https.request(opts, function (res) {
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

function sbRest(m, p, b) { return sbRequest(m, '/rest/v1/', p, b); }
function sbAuth(m, p, b) { return sbRequest(m, '/auth/v1/', p, b); }

function callFunction(host, fnName, body) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify(body);
    var opts = {
      hostname: host,
      port: 443,
      path: '/.netlify/functions/' + fnName,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    var timer = setTimeout(function () { reject(new Error('Timeout')); }, 12000);
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
    req.write(payload);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
  }

  if (!SB_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY not set' }) };
  }

  var steps = [];
  var passed = 0;
  var failed = 0;

  function step(label, ok, detail) {
    steps.push({ label: label, ok: ok, detail: detail || '' });
    if (ok) passed++; else failed++;
  }

  var TEST_EMAIL = 'delete-test-' + Date.now() + '@oob-test.com';
  var userId = null;
  var orgId = null;
  var host = event.headers.host || 'outofboundsscoring.netlify.app';

  try {
    // 1. Create auth user (admin API, bypasses email confirmation)
    var userRes = await sbAuth('POST', 'admin/users', {
      email: TEST_EMAIL,
      email_confirm: true,
      password: 'TestDelete123!'
    });
    step('Create auth user', userRes.status === 200 && userRes.data && !!userRes.data.id,
         'email=' + TEST_EMAIL + ' status=' + userRes.status);
    if (!userRes.data || !userRes.data.id) throw new Error('User creation failed');
    userId = userRes.data.id;

    // 2. Create organiser row
    var slug = 'delete-test-' + Date.now();
    var orgRes = await sbRest('POST', 'organisers', {
      auth_user_id: userId,
      name: 'Delete Test Org',
      slug: slug,
      plan: 'play',
      plan_source: 'comp'
    });
    step('Create organiser', orgRes.status === 201 && orgRes.data && orgRes.data.length > 0,
         'slug=' + slug);
    if (!orgRes.data || !orgRes.data.length) throw new Error('Org creation failed');
    orgId = orgRes.data[0].id;

    // 3. Get a session token
    var linkRes = await sbAuth('POST', 'admin/generate_link', {
      type: 'magiclink',
      email: TEST_EMAIL
    });
    var accessToken = null;
    var ht = linkRes.data && linkRes.data.properties && linkRes.data.properties.hashed_token;
    var al = (linkRes.data && linkRes.data.action_link) || '';
    var um = al.match(/[?&]token=([^&#]+)/);
    var otp = um ? decodeURIComponent(um[1]) : null;

    if (otp) {
      var v = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: otp });
      if (v.status === 200 && v.data) accessToken = v.data.access_token;
    }
    if (!accessToken && ht) {
      var v2 = await sbAuth('POST', 'verify', { type: 'magiclink', token_hash: ht });
      if (v2.status === 200 && v2.data) accessToken = v2.data.access_token;
    }
    if (!accessToken) accessToken = linkRes.data && linkRes.data.access_token;

    step('Get session token', !!accessToken);
    if (!accessToken) throw new Error('No access token');

    // 4. Call account-delete function with the token
    var delRes = await callFunction(host, 'account-delete', { auth_token: accessToken });
    step('account-delete function returns ok', delRes.status === 200 && delRes.data && delRes.data.ok,
         'status=' + delRes.status + ' body=' + JSON.stringify(delRes.data).slice(0, 200));

    // 5. Verify organiser row is gone
    var orgCheck = await sbRest('GET', 'organisers?id=eq.' + orgId + '&select=id');
    var orgGone = orgCheck.data && orgCheck.data.length === 0;
    step('Organiser row deleted from database', orgGone);

    // 6. Verify auth user is gone
    var userCheck = await sbAuth('GET', 'admin/users/' + userId);
    var userGone = userCheck.status === 404 ||
      (userCheck.data && (userCheck.data.code === 'user_not_found' || userCheck.data.msg === 'User not found'));
    step('Auth user deleted from Supabase', userGone, 'status=' + userCheck.status);

  } catch (err) {
    step('Unexpected error', false, err.message);
  }

  // Safety cleanup
  try {
    if (orgId) {
      await sbRest('DELETE', 'events?organiser_id=eq.' + orgId);
      await sbRest('DELETE', 'people?organiser_id=eq.' + orgId);
      await sbRest('DELETE', 'organisers?id=eq.' + orgId);
    }
    if (userId) await sbAuth('DELETE', 'admin/users/' + userId).catch(function () {});
  } catch (e) {}

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passed: passed, failed: failed, total: passed + failed, steps: steps })
  };
};
