'use strict';

/**
 * Tenancy isolation test — proves that Organiser A cannot read or
 * mutate Organiser B's data through any Netlify function endpoint.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=xxx node tests/tenancy.test.js
 */

var https = require('https');
var crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
var SUPABASE_URL  = 'https://ahutmswadskdkqhnrhhh.supabase.co';
var SB_HOST       = 'ahutmswadskdkqhnrhhh.supabase.co';
var SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
var LIVE_URL      = 'https://outofboundsscoring.netlify.app';
var LIVE_HOST     = 'outofboundsscoring.netlify.app';

if (!SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_KEY environment variable.');
  process.exit(1);
}

var TS = Date.now();
var passed = 0;
var failed = 0;
var results = [];

// ---------------------------------------------------------------------------
// Helpers — Supabase REST (direct, using service key)
// ---------------------------------------------------------------------------
function sbRequest(method, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var opts = {
      hostname: SB_HOST, port: 443,
      path: '/rest/v1/' + path,
      method: method, headers: headers
    };
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve(raw ? JSON.parse(raw) : null); }
        catch (e) { reject(new Error('Bad JSON from Supabase: ' + raw.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function sbGet(path)        { return sbRequest('GET', path, null); }
function sbPost(path, body) { return sbRequest('POST', path, body); }
function sbPatch(path, body){ return sbRequest('PATCH', path, body); }
function sbDelete(path) {
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: SB_HOST, port: 443,
      path: '/rest/v1/' + path,
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      }
    };
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(); });
    });
    req.on('error', reject);
    req.end();
  });
}

function genToken() { return crypto.randomBytes(16).toString('hex'); }

// ---------------------------------------------------------------------------
// Helpers — HTTP calls to Netlify functions
// ---------------------------------------------------------------------------
function netlifyRequest(method, fnPath, body, extraHeaders) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var opts = {
      hostname: LIVE_HOST, port: 443,
      path: fnPath,
      method: method,
      headers: headers
    };
    var timer = setTimeout(function () { reject(new Error('Netlify request timed out: ' + fnPath)); }, 30000);
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        resolve({ status: res.statusCode, body: parsed, raw: raw });
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function fnGet(fnName, qs) {
  var path = '/.netlify/functions/' + fnName;
  if (qs) {
    var parts = [];
    Object.keys(qs).forEach(function (k) { parts.push(k + '=' + encodeURIComponent(qs[k])); });
    path += '?' + parts.join('&');
  }
  return netlifyRequest('GET', path, null);
}
function fnPost(fnName, body, extraHeaders) {
  return netlifyRequest('POST', '/.netlify/functions/' + fnName, body, extraHeaders);
}
function fnPatch(fnName, body) {
  return netlifyRequest('PATCH', '/.netlify/functions/' + fnName, body);
}

// Simple GET for plain paths (results page, board)
function httpGet(path) {
  return new Promise(function (resolve, reject) {
    var opts = { hostname: LIVE_HOST, port: 443, path: path, method: 'GET' };
    var timer = setTimeout(function () { reject(new Error('GET timeout: ' + path)); }, 30000);
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString() });
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
function assert(label, condition, detail) {
  if (condition) {
    passed++;
    results.push({ label: label, result: 'PASS', detail: detail || '' });
    console.log('  PASS  ' + label + (detail ? '  (' + detail + ')' : ''));
  } else {
    failed++;
    results.push({ label: label, result: 'FAIL', detail: detail || '' });
    console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : ''));
  }
}

function bodyContainsNone(raw, forbidden) {
  if (!raw) return true;
  var text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  for (var i = 0; i < forbidden.length; i++) {
    if (text.indexOf(forbidden[i]) !== -1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
(async function () {
  console.log('=== Tenancy Isolation Test ===\n');
  console.log('Timestamp suffix: ' + TS);

  // -----------------------------------------------------------------------
  // 1. SETUP
  // -----------------------------------------------------------------------
  console.log('\n--- SETUP ---\n');

  // Create two organisers
  var orgASlug = 'test-org-a-' + TS;
  var orgBSlug = 'test-org-b-' + TS;

  var orgAArr = await sbPost('organisers', {
    slug: orgASlug, name: 'Test Org A', plan: 'per_event',
    contact_email: 'test-a@example.com'
  });
  var orgA = Array.isArray(orgAArr) ? orgAArr[0] : orgAArr;
  console.log('Organiser A: ' + orgA.id + ' (' + orgASlug + ')');

  var orgBArr = await sbPost('organisers', {
    slug: orgBSlug, name: 'Test Org B', plan: 'per_event',
    contact_email: 'test-b@example.com'
  });
  var orgB = Array.isArray(orgBArr) ? orgBArr[0] : orgBArr;
  console.log('Organiser B: ' + orgB.id + ' (' + orgBSlug + ')');

  // Create courses for each
  var courseAArr = await sbPost('courses', { name: 'Test Course A', organiser_id: orgA.id });
  var courseA = Array.isArray(courseAArr) ? courseAArr[0] : courseAArr;

  var courseBArr = await sbPost('courses', { name: 'Test Course B', organiser_id: orgB.id });
  var courseB = Array.isArray(courseBArr) ? courseBArr[0] : courseBArr;

  // Create tees
  var teeAArr = await sbPost('course_tees', {
    course_id: courseA.id, tee_name: 'White', slope: 125, rating: 71.2, par_total: 72
  });
  var teeA = Array.isArray(teeAArr) ? teeAArr[0] : teeAArr;

  var teeBArr = await sbPost('course_tees', {
    course_id: courseB.id, tee_name: 'Yellow', slope: 120, rating: 69.8, par_total: 72
  });
  var teeB = Array.isArray(teeBArr) ? teeBArr[0] : teeBArr;

  // Create 18 holes for each course
  var holesA = [];
  var holesB = [];
  for (var h = 1; h <= 18; h++) {
    holesA.push({ course_id: courseA.id, hole_number: h, par: (h % 3 === 0 ? 5 : h % 3 === 1 ? 4 : 3), stroke_index: h });
    holesB.push({ course_id: courseB.id, hole_number: h, par: (h % 3 === 0 ? 5 : h % 3 === 1 ? 4 : 3), stroke_index: h });
  }
  await sbPost('course_holes', holesA);
  await sbPost('course_holes', holesB);

  // Create events (status=live, paid=true so scorer can submit)
  var eventASlug = 'test-event-a-' + TS;
  var eventBSlug = 'test-event-b-' + TS;

  var evAArr = await sbPost('events', {
    organiser_id: orgA.id, slug: eventASlug, name: 'Test Event A',
    course_id: courseA.id, tee_id: teeA.id, format: 'individual_stableford',
    status: 'live', paid: true, event_date: '2026-09-18'
  });
  var evA = Array.isArray(evAArr) ? evAArr[0] : evAArr;
  console.log('Event A: ' + evA.id);

  var evBArr = await sbPost('events', {
    organiser_id: orgB.id, slug: eventBSlug, name: 'Test Event B',
    course_id: courseB.id, tee_id: teeB.id, format: 'individual_stableford',
    status: 'live', paid: true, event_date: '2026-09-18'
  });
  var evB = Array.isArray(evBArr) ? evBArr[0] : evBArr;
  console.log('Event B: ' + evB.id);

  // Player names — these are unique and will be used to detect leaks
  var namesA = ['AlphaAlice TestA', 'AlphaBob TestA', 'AlphaCharlie TestA', 'AlphaDave TestA'];
  var namesB = ['BravoBeth TestB', 'BravoCarl TestB', 'BravoDiana TestB', 'BravoEd TestB'];

  // Create players for event A
  var playersAData = namesA.map(function (n) {
    var parts = n.split(' ');
    return {
      event_id: evA.id,
      first_name: parts[0], last_name: parts[1],
      display_name: n,
      handicap_index: 15.0, playing_handicap: 16,
      player_token: genToken()
    };
  });
  var playersA = await sbPost('players', playersAData);
  if (!Array.isArray(playersA)) playersA = [playersA];
  console.log('Players A created: ' + playersA.length);

  // Create players for event B
  var playersBData = namesB.map(function (n) {
    var parts = n.split(' ');
    return {
      event_id: evB.id,
      first_name: parts[0], last_name: parts[1],
      display_name: n,
      handicap_index: 18.0, playing_handicap: 20,
      player_token: genToken()
    };
  });
  var playersB = await sbPost('players', playersBData);
  if (!Array.isArray(playersB)) playersB = [playersB];
  console.log('Players B created: ' + playersB.length);

  // Create groups and assign players
  var groupAArr = await sbPost('groups', {
    event_id: evA.id, group_number: 1, starting_hole: 1,
    scorer_player_id: playersA[0].id
  });
  var groupA = Array.isArray(groupAArr) ? groupAArr[0] : groupAArr;

  var groupBArr = await sbPost('groups', {
    event_id: evB.id, group_number: 1, starting_hole: 1,
    scorer_player_id: playersB[0].id
  });
  var groupB = Array.isArray(groupBArr) ? groupBArr[0] : groupBArr;

  // Assign players to groups
  for (var i = 0; i < playersA.length; i++) {
    await sbPatch('players?id=eq.' + playersA[i].id, { group_id: groupA.id });
  }
  for (var i = 0; i < playersB.length; i++) {
    await sbPatch('players?id=eq.' + playersB[i].id, { group_id: groupB.id });
  }

  // Insert some scores for both events
  var scoresA = [];
  var scoresB = [];
  for (var h = 1; h <= 6; h++) {
    for (var p = 0; p < playersA.length; p++) {
      scoresA.push({
        event_id: evA.id, player_id: playersA[p].id,
        hole_number: h, gross_score: 4 + (p % 3), picked_up: false,
        recorded_by_player_id: playersA[0].id
      });
    }
    for (var p = 0; p < playersB.length; p++) {
      scoresB.push({
        event_id: evB.id, player_id: playersB[p].id,
        hole_number: h, gross_score: 5 + (p % 3), picked_up: false,
        recorded_by_player_id: playersB[0].id
      });
    }
  }
  await sbPost('hole_scores', scoresA);
  await sbPost('hole_scores', scoresB);
  console.log('Scores inserted: A=' + scoresA.length + ' B=' + scoresB.length);

  // Re-fetch players to get tokens (they were set at creation)
  playersA = await sbGet('players?event_id=eq.' + evA.id + '&select=id,player_token,display_name,group_id&order=created_at.asc');
  playersB = await sbGet('players?event_id=eq.' + evB.id + '&select=id,player_token,display_name,group_id&order=created_at.asc');

  var tokenA = playersA[0].player_token;  // scorer for A
  var tokenB = playersB[0].player_token;  // scorer for B

  console.log('\nSetup complete.\n');

  // Forbidden strings: B's data must never appear in A's responses (and vice versa)
  var forbiddenB = namesB.concat([evB.id, orgB.id]);
  var forbiddenA = namesA.concat([evA.id, orgA.id]);

  // -----------------------------------------------------------------------
  // 2. TESTS — organiser_id auth endpoints
  // -----------------------------------------------------------------------
  console.log('--- ORGANISER-ID AUTH TESTS (A trying to access B) ---\n');

  // a. org-events GET: A's organiser_id should not return B's events
  var r = await fnGet('org-events', { organiser_id: orgA.id });
  assert(
    'org-events GET with A\'s ID returns no B data',
    r.status === 200 && bodyContainsNone(r.raw, forbiddenB),
    'status=' + r.status
  );

  // Also: using B's organiser_id should return B's events (but this is expected —
  // the real check is that you need the ID). The system trusts organiser_id as a key.
  // Let's verify A's ID doesn't return B's data.
  var rB = await fnGet('org-events', { organiser_id: orgB.id });
  assert(
    'org-events GET with B\'s ID returns B data (expected, no auth beyond ID)',
    rB.status === 200,
    'status=' + rB.status
  );

  // b. org-events PATCH: try to update B's event using A's organiser_id
  r = await fnPatch('org-events', {
    id: evB.id,
    organiser_id: orgA.id,
    name: 'HACKED BY A'
  });
  assert(
    'org-events PATCH B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // Verify B's event name unchanged
  var evBCheck = await sbGet('events?id=eq.' + evB.id + '&select=name&limit=1');
  assert(
    'org-events PATCH did not mutate B\'s event name',
    evBCheck && evBCheck[0] && evBCheck[0].name === 'Test Event B',
    'name=' + (evBCheck && evBCheck[0] ? evBCheck[0].name : 'N/A')
  );

  // c. org-events POST finish: try to finish B's event using A's organiser_id
  r = await fnPost('org-events', {
    action: 'finish',
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-events POST finish B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // Verify B's event is still live
  evBCheck = await sbGet('events?id=eq.' + evB.id + '&select=status&limit=1');
  assert(
    'org-events finish did not change B\'s event status',
    evBCheck && evBCheck[0] && evBCheck[0].status === 'live',
    'status=' + (evBCheck && evBCheck[0] ? evBCheck[0].status : 'N/A')
  );

  // c2. org-events POST go_live: try with A's organiser_id on B's event
  r = await fnPost('org-events', {
    action: 'go_live',
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-events POST go_live B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // c3. org-events POST clone: try to clone B's event using A's organiser_id
  r = await fnPost('org-events', {
    action: 'clone',
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-events POST clone B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // d. org-players GET: try to list B's players using A's organiser_id
  r = await fnGet('org-players', { event_id: evB.id, organiser_id: orgA.id });
  assert(
    'org-players GET B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );
  assert(
    'org-players GET response contains no B player data',
    bodyContainsNone(r.raw, namesB),
    ''
  );

  // e. org-players POST: try to add players to B's event using A's organiser_id
  r = await fnPost('org-players', {
    event_id: evB.id,
    organiser_id: orgA.id,
    players: [{ first_name: 'Hacker', last_name: 'Injected' }]
  });
  assert(
    'org-players POST to B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // e2. org-players POST paste: try to paste players into B's event
  r = await fnPost('org-players', {
    action: 'paste',
    event_id: evB.id,
    organiser_id: orgA.id,
    text: 'Hacker Injected, 12.0'
  });
  assert(
    'org-players POST paste to B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // e3. org-players PATCH: try to modify B's player using A's organiser_id
  r = await fnPatch('org-players', {
    id: playersB[0].id,
    event_id: evB.id,
    organiser_id: orgA.id,
    first_name: 'HACKED'
  });
  assert(
    'org-players PATCH B\'s player with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // Verify B's player name unchanged
  var pBCheck = await sbGet('players?id=eq.' + playersB[0].id + '&select=first_name&limit=1');
  assert(
    'org-players PATCH did not mutate B\'s player name',
    pBCheck && pBCheck[0] && pBCheck[0].first_name !== 'HACKED',
    'first_name=' + (pBCheck && pBCheck[0] ? pBCheck[0].first_name : 'N/A')
  );

  // e4. org-players DELETE: try to delete B's player using A's organiser_id
  r = await fnPost('org-players', {
    action: 'delete',
    id: playersB[0].id,
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-players DELETE B\'s player with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // f. org-groups GET: try to list B's groups using A's organiser_id
  r = await fnGet('org-groups', { event_id: evB.id, organiser_id: orgA.id });
  assert(
    'org-groups GET B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );
  assert(
    'org-groups GET response contains no B data',
    bodyContainsNone(r.raw, namesB),
    ''
  );

  // f2. org-groups POST auto_fill: try on B's event
  r = await fnPost('org-groups', {
    action: 'auto_fill',
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-groups POST auto_fill B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // f3. org-groups POST assign: try to assign B's player to a group
  r = await fnPost('org-groups', {
    action: 'assign',
    event_id: evB.id,
    organiser_id: orgA.id,
    player_id: playersB[1].id,
    group_id: groupA.id
  });
  assert(
    'org-groups POST assign B\'s player with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // f4. org-groups POST create_group: try on B's event
  r = await fnPost('org-groups', {
    action: 'create_group',
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'org-groups POST create_group on B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // f5. org-groups PATCH: try to update B's group using A's organiser_id
  r = await fnPatch('org-groups', {
    id: groupB.id,
    event_id: evB.id,
    organiser_id: orgA.id,
    tee_time: '08:00'
  });
  assert(
    'org-groups PATCH B\'s group with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // g. org-courses: GET search is public (allowed)
  r = await fnGet('org-courses', { search: 'Test Course' });
  assert(
    'org-courses GET search is allowed (public)',
    r.status === 200,
    'status=' + r.status
  );

  // org-courses: GET by id is also public
  r = await fnGet('org-courses', { id: courseB.id });
  assert(
    'org-courses GET by id is allowed (public)',
    r.status === 200,
    'status=' + r.status
  );

  // h. stripe-checkout POST: try to create checkout for B's event with A's organiser_id
  //    (this will 403 because ownership check fails — it won't reach Stripe)
  r = await fnPost('stripe-checkout', {
    event_id: evB.id,
    organiser_id: orgA.id
  });
  assert(
    'stripe-checkout POST B\'s event with A\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // -----------------------------------------------------------------------
  // PLAYER TOKEN AUTH TESTS
  // -----------------------------------------------------------------------
  console.log('\n--- PLAYER TOKEN AUTH TESTS ---\n');

  // i. score-save: POST with A's scorer token but B's player_id
  r = await fnPost('score-save', {
    token: tokenA,
    scores: [{
      player_id: playersB[0].id,
      hole_number: 7,
      gross_score: 4
    }]
  });
  assert(
    'score-save POST A\'s token + B\'s player_id → 403 (not in your group)',
    r.status === 403,
    'status=' + r.status + ' body=' + (r.body ? r.body.error : 'none')
  );

  // Verify no score was written for B's player on hole 7
  var scoreCheck = await sbGet(
    'hole_scores?event_id=eq.' + evB.id +
    '&player_id=eq.' + playersB[0].id +
    '&hole_number=eq.7&select=id&limit=1'
  );
  assert(
    'score-save did not write score to B\'s player',
    !scoreCheck || scoreCheck.length === 0,
    ''
  );

  // i2. score-save: POST with A's non-scorer token (player index 1, not designated scorer)
  r = await fnPost('score-save', {
    token: playersA[1].player_token,
    scores: [{
      player_id: playersA[0].id,
      hole_number: 7,
      gross_score: 4
    }]
  });
  assert(
    'score-save POST non-scorer A token → 403 (not designated scorer)',
    r.status === 403,
    'status=' + r.status + ' body=' + (r.body ? r.body.error : 'none')
  );

  // i3. score-save: POST with bogus token
  r = await fnPost('score-save', {
    token: 'totally-fake-token-12345',
    scores: [{
      player_id: playersA[0].id,
      hole_number: 7,
      gross_score: 4
    }]
  });
  assert(
    'score-save POST bogus token → 404 (player not found)',
    r.status === 404,
    'status=' + r.status
  );

  // j. player-context: GET with B's player token — should return B's own data (personal link, this is OK)
  r = await fnGet('player-context', { token: tokenB });
  assert(
    'player-context GET B\'s token → 200 (personal link OK)',
    r.status === 200,
    'status=' + r.status
  );
  assert(
    'player-context returns B\'s data correctly',
    r.body && r.body.player && r.body.player.display_name === playersB[0].display_name,
    'player=' + (r.body && r.body.player ? r.body.player.display_name : 'none')
  );

  // j2. player-context: Verify B's context does NOT leak A's data
  assert(
    'player-context for B contains no A data',
    bodyContainsNone(r.raw, namesA),
    ''
  );

  // j3. player-context with bogus token
  r = await fnGet('player-context', { token: 'bogus-token-fake' });
  assert(
    'player-context GET bogus token → 404',
    r.status === 404,
    'status=' + r.status
  );

  // -----------------------------------------------------------------------
  // PUBLIC ENDPOINTS
  // -----------------------------------------------------------------------
  console.log('\n--- PUBLIC ENDPOINT TESTS ---\n');

  // k. leaderboard: GET with B's event_id, all modes
  var modes = ['player', 'board', 'organiser'];
  for (var mi = 0; mi < modes.length; mi++) {
    var mode = modes[mi];
    r = await fnGet('leaderboard', { event: evB.id, mode: mode });
    assert(
      'leaderboard GET B\'s event mode=' + mode + ' → 200 (public)',
      r.status === 200,
      'status=' + r.status
    );
    // Public endpoint — should contain B's player names (this is expected)
    if (r.body && r.body.entries) {
      assert(
        'leaderboard mode=' + mode + ' has entries',
        r.body.entries.length > 0,
        'entries=' + r.body.entries.length
      );
    }
  }

  // k2. leaderboard with invalid event_id → 404
  r = await fnGet('leaderboard', { event: '00000000-0000-0000-0000-000000000000', mode: 'player' });
  assert(
    'leaderboard GET non-existent event → 404',
    r.status === 404,
    'status=' + r.status
  );

  // l. results-page: GET /r/<orgBSlug>/<eventBSlug>
  r = await httpGet('/r/' + orgBSlug + '/' + eventBSlug);
  assert(
    'results-page GET B\'s event → 200 (public)',
    r.status === 200,
    'status=' + r.status
  );
  // Results page should contain B's event name
  assert(
    'results-page contains B\'s event name',
    r.raw.indexOf('Test Event B') !== -1,
    ''
  );
  // Should NOT contain A's data
  assert(
    'results-page for B contains no A data',
    bodyContainsNone(r.raw, namesA),
    ''
  );

  // l2. results-page with non-existent slugs → 404
  r = await httpGet('/r/nonexistent-org/nonexistent-event');
  assert(
    'results-page GET non-existent org → 404',
    r.status === 404,
    'status=' + r.status
  );

  // m. board page: GET /board/#/... (this is a client-side route, so the server
  //    returns the SPA shell at 200)
  r = await httpGet('/board/');
  assert(
    'board page serves SPA shell → 200',
    r.status === 200,
    'status=' + r.status
  );

  // -----------------------------------------------------------------------
  // SPECIAL TESTS
  // -----------------------------------------------------------------------
  console.log('\n--- SPECIAL TESTS ---\n');

  // n. stripe-webhook: POST with bad signature → rejected
  r = await fnPost('stripe-webhook', {
    type: 'checkout.session.completed',
    data: { object: { metadata: { event_id: evA.id, organiser_id: orgA.id } } }
  }, {
    'stripe-signature': 't=12345,v1=badsignaturehere'
  });
  assert(
    'stripe-webhook POST bad signature → 400',
    r.status === 400,
    'status=' + r.status
  );

  // n2. stripe-webhook: POST with no signature header
  r = await fnPost('stripe-webhook', {
    type: 'checkout.session.completed',
    data: { object: { metadata: { event_id: evA.id } } }
  });
  assert(
    'stripe-webhook POST no signature → 400',
    r.status === 400,
    'status=' + r.status
  );

  // o. stripe-webhook: forged checkout for wrong event — even if sig somehow passed,
  //    verify that A's event did not get marked paid differently.
  //    We test this by confirming the webhook rejects the bad signature and
  //    A's event state is unchanged.
  var evACheck = await sbGet('events?id=eq.' + evA.id + '&select=status,paid&limit=1');
  assert(
    'A\'s event unchanged after webhook attempts (still live+paid)',
    evACheck && evACheck[0] && evACheck[0].status === 'live' && evACheck[0].paid === true,
    'status=' + (evACheck && evACheck[0] ? evACheck[0].status : 'N/A')
  );

  // -----------------------------------------------------------------------
  // CROSS-CHECKS: A cannot act as scorer for B
  // -----------------------------------------------------------------------
  console.log('\n--- CROSS-SCORER TESTS ---\n');

  // Try to save scores using A's scorer token but targeting a valid A player
  // with a hole that hasn't been scored yet — this should WORK (positive control)
  r = await fnPost('score-save', {
    token: tokenA,
    scores: [{
      player_id: playersA[0].id,
      hole_number: 10,
      gross_score: 5
    }]
  });
  assert(
    'score-save POST A\'s token + A\'s player → 200 (positive control)',
    r.status === 200,
    'status=' + r.status
  );

  // Verify the score was actually written
  var posCheck = await sbGet(
    'hole_scores?event_id=eq.' + evA.id +
    '&player_id=eq.' + playersA[0].id +
    '&hole_number=eq.10&select=gross_score&limit=1'
  );
  assert(
    'Positive control score was written correctly',
    posCheck && posCheck.length > 0 && posCheck[0].gross_score === 5,
    'gross_score=' + (posCheck && posCheck[0] ? posCheck[0].gross_score : 'N/A')
  );

  // -----------------------------------------------------------------------
  // ADDITIONAL ISOLATION: B trying to access A
  // -----------------------------------------------------------------------
  console.log('\n--- REVERSE DIRECTION: B accessing A ---\n');

  r = await fnPatch('org-events', {
    id: evA.id,
    organiser_id: orgB.id,
    name: 'HACKED BY B'
  });
  assert(
    'org-events PATCH A\'s event with B\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  r = await fnGet('org-players', { event_id: evA.id, organiser_id: orgB.id });
  assert(
    'org-players GET A\'s event with B\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );
  assert(
    'org-players GET (B→A) response contains no A player data',
    bodyContainsNone(r.raw, namesA),
    ''
  );

  r = await fnGet('org-groups', { event_id: evA.id, organiser_id: orgB.id });
  assert(
    'org-groups GET A\'s event with B\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  r = await fnPost('score-save', {
    token: tokenB,
    scores: [{
      player_id: playersA[0].id,
      hole_number: 11,
      gross_score: 3
    }]
  });
  assert(
    'score-save POST B\'s token + A\'s player_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  r = await fnPost('stripe-checkout', {
    event_id: evA.id,
    organiser_id: orgB.id
  });
  assert(
    'stripe-checkout POST A\'s event with B\'s organiser_id → 403',
    r.status === 403,
    'status=' + r.status
  );

  // -----------------------------------------------------------------------
  // 2b. PRO vs PLAY GATING
  // -----------------------------------------------------------------------
  console.log('\n--- PRO vs PLAY GATING TESTS ---\n');

  // Set org A to Pro, org B stays Play (per_event)
  await sbPatch('organisers?id=eq.' + orgA.id, { plan: 'pro' });

  // Pro org A: stripe-checkout should return {free:true} and set event live
  // First reset event A to draft
  await sbPatch('events?id=eq.' + evA.id, { status: 'draft', paid: false, paid_at: null });

  r = await fnPost('stripe-checkout', {
    event_id: evA.id,
    organiser_id: orgA.id
  });
  assert(
    'Pro org: stripe-checkout returns free=true',
    r.status === 200 && r.body && r.body.free === true,
    'status=' + r.status + ' body=' + JSON.stringify(r.body)
  );

  // Verify event A is now live+paid
  var evACheck = await sbGet('events?id=eq.' + evA.id + '&select=status,paid');
  assert(
    'Pro org: event is now live+paid',
    evACheck[0] && evACheck[0].status === 'live' && evACheck[0].paid === true,
    'status=' + (evACheck[0] && evACheck[0].status) + ' paid=' + (evACheck[0] && evACheck[0].paid)
  );

  // Play org B: stripe-checkout should return a Stripe URL (not free)
  // Reset event B to draft first
  await sbPatch('events?id=eq.' + evB.id, { status: 'draft', paid: false, paid_at: null });

  r = await fnPost('stripe-checkout', {
    event_id: evB.id,
    organiser_id: orgB.id
  });
  assert(
    'Play org: stripe-checkout returns Stripe URL',
    r.status === 200 && r.body && r.body.url && r.body.url.indexOf('checkout.stripe.com') !== -1,
    'status=' + r.status + ' hasUrl=' + !!(r.body && r.body.url)
  );

  // Reset org A back to per_event for cleanup
  await sbPatch('organisers?id=eq.' + orgA.id, { plan: 'per_event' });

  // -----------------------------------------------------------------------
  // 3. CLEANUP
  // -----------------------------------------------------------------------
  console.log('\n--- CLEANUP ---\n');

  // Delete in order: scores, players, groups, events, holes, tees, courses, organisers
  await sbDelete('hole_scores?event_id=eq.' + evA.id);
  await sbDelete('hole_scores?event_id=eq.' + evB.id);
  console.log('Scores deleted');

  await sbDelete('players?event_id=eq.' + evA.id);
  await sbDelete('players?event_id=eq.' + evB.id);
  console.log('Players deleted');

  await sbDelete('groups?event_id=eq.' + evA.id);
  await sbDelete('groups?event_id=eq.' + evB.id);
  console.log('Groups deleted');

  // Delete payments if any were created
  await sbDelete('payments?event_id=eq.' + evA.id);
  await sbDelete('payments?event_id=eq.' + evB.id);
  console.log('Payments deleted');

  await sbDelete('events?id=eq.' + evA.id);
  await sbDelete('events?id=eq.' + evB.id);
  console.log('Events deleted');

  await sbDelete('course_holes?course_id=eq.' + courseA.id);
  await sbDelete('course_holes?course_id=eq.' + courseB.id);
  console.log('Holes deleted');

  await sbDelete('course_tees?course_id=eq.' + teeA.id);
  await sbDelete('course_tees?course_id=eq.' + teeB.id);
  console.log('Tees deleted');

  await sbDelete('courses?id=eq.' + courseA.id);
  await sbDelete('courses?id=eq.' + courseB.id);
  console.log('Courses deleted');

  await sbDelete('organisers?id=eq.' + orgA.id);
  await sbDelete('organisers?id=eq.' + orgB.id);
  console.log('Organisers deleted');

  // -----------------------------------------------------------------------
  // 4. SUMMARY
  // -----------------------------------------------------------------------
  console.log('\n========================================');
  console.log('  TENANCY ISOLATION TEST RESULTS');
  console.log('========================================');
  console.log('  PASSED: ' + passed);
  console.log('  FAILED: ' + failed);
  console.log('  TOTAL:  ' + (passed + failed));
  console.log('========================================\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.forEach(function (r) {
      if (r.result === 'FAIL') {
        console.log('  - ' + r.label + (r.detail ? '  (' + r.detail + ')' : ''));
      }
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);

})().catch(function (err) {
  console.error('\nFATAL ERROR:', err);
  process.exit(2);
});
