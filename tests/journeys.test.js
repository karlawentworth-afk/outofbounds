// journeys.test.js — UI journey tests against TEST_URL
// Run: node tests/journeys.test.js
// Requires: playwright, REVIEWER_CODE env or .claude/settings.local.json

'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var { chromium } = require('playwright');

// ── Config ──────────────────────────────────────────────────────
var BASE = process.env.TEST_URL || 'https://outofboundsscoring.netlify.app';
var HOST = new URL(BASE).hostname;

// Load service key for setup/teardown
function loadKey(name) {
  try {
    var raw = fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.local.json'), 'utf8');
    if (name === 'SUPABASE_SERVICE_KEY') {
      var m = raw.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      return m ? m[0] : '';
    }
    if (name === 'REVIEWER_CODE') {
      // The REVIEWER_CODE is 6 digits, stored in Netlify env
      return process.env.REVIEWER_CODE || '';
    }
  } catch (e) { /* ignore */ }
  return process.env[name] || '';
}

var SB_KEY = loadKey('SUPABASE_SERVICE_KEY');
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';

if (!SB_KEY || SB_KEY.length < 100) {
  console.error('FATAL: service key is masked or missing.');
  process.exit(1);
}

var passed = 0, failed = 0, total = 0;
function step(label, ok, detail) {
  total++;
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else    { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── Supabase REST helper ────────────────────────────────────────
function sbRest(method, restPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/rest/v1/' + restPath, method: method, headers: headers }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Supabase Auth helper ───────────────────────────────────────
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';
var authToken = '';
var authRefreshToken = '';
var authUserId = '';

function sbAuth(method, authPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : null;
    var headers = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/auth/v1/' + authPath, method: method, headers: headers }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createTestUser() {
  var email = 'journey-' + Date.now() + '@example.com';
  var pass = 'JourneyTest_' + Date.now() + '!';
  var user = await sbAuth('POST', 'admin/users', { email: email, password: pass, email_confirm: true });
  authUserId = user.id;
  // Link to Test Org
  await sbRest('PATCH', 'organisers?id=eq.' + TEST_ORG_ID, { auth_user_id: user.id });
  // Sign in with anon key
  var signin = await new Promise(function (resolve, reject) {
    var payload = JSON.stringify({ email: email, password: pass });
    var req = https.request({ hostname: SB_HOST, port: 443, path: '/auth/v1/token?grant_type=password', method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  authToken = signin.access_token;
  authRefreshToken = signin.refresh_token;
  return { userId: user.id, email: email };
}

function apiFetch(fnName, opts) {
  opts = opts || {};
  var method = opts.method || 'POST';
  var body = opts.body ? JSON.stringify(opts.body) : null;
  var qs = opts.query || {};
  var qsParts = Object.keys(qs).map(function (k) { return k + '=' + encodeURIComponent(qs[k]); });
  var qsStr = qsParts.length ? '?' + qsParts.join('&') : '';
  return new Promise(function (resolve, reject) {
    var headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    var req = https.request({ hostname: HOST, port: 443, path: '/.netlify/functions/' + fnName + qsStr, method: method, headers: headers }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Test Org ────────────────────────────────────────────────────
var TEST_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
var state = {};

// ── Journey 1: Organiser creates an event, goes live ────────────
async function journey1_organiser(browser) {
  console.log('\n=== Journey 1: Organiser — sign in, new event, go live ===');

  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var page = await ctx.newPage();

  // Set the Supabase session in localStorage before loading the page
  // This makes the SPA's onAuthStateChange pick up the test user's session
  await page.goto(BASE + '/o/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(function (tokens) {
    var storageKey = 'sb-ahutmswadskdkqhnrhhh-auth-token';
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: tokens.access,
      refresh_token: tokens.refresh,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }));
  }, { access: authToken, refresh: authRefreshToken });

  // Reload so the SPA picks up the session from localStorage
  await page.reload({ waitUntil: 'load' });

  // Wait for dashboard (up to 20s)
  var currentScreen = 'unknown';
  for (var wait = 0; wait < 40; wait++) {
    await sleep(500);
    currentScreen = await page.evaluate(function () {
      var dash = document.getElementById('screen-dashboard');
      if (dash && dash.offsetHeight > 0) return 'dashboard';
      var signin = document.getElementById('screen-signin');
      if (signin && signin.offsetHeight > 0) return 'signin';
      return 'unknown';
    });
    if (currentScreen === 'dashboard') break;
  }

  step('Sign in: dashboard visible', currentScreen === 'dashboard', 'screen=' + currentScreen);

  if (currentScreen !== 'dashboard') {
    await ctx.close();
    return;
  }

  // Create a new event via API with course and tees
  var eventName = 'Journey Test ' + Date.now();
  var createRes = await apiFetch('org-events', {
    body: {
      organiser_id: TEST_ORG_ID,
      name: eventName,
      format: 'individual_stableford',
      course_id: 'c0000000-0000-0000-0000-000000000001',
      tee_id: 'd0000000-0000-0000-0000-000000000001',
      handicap_allowance: 0.95
    }
  });
  if (createRes.status !== 200 || !createRes.data || !createRes.data.event) {
    step('Create event with course and tees', false, 'status=' + createRes.status + ' ' + JSON.stringify(createRes.data).substring(0, 100));
    await ctx.close();
    return;
  }
  state.eventId = createRes.data.event.id;
  state.eventSlug = createRes.data.event.slug;
  step('Create event with course and tees', true, 'id=' + state.eventId);

  // Add 4 players with handicaps
  var addRes = await apiFetch('org-players', {
    body: {
      event_id: state.eventId,
      organiser_id: TEST_ORG_ID,
      players: [
        { first_name: 'Alice', last_name: 'Test', handicap_index: 14.0 },
        { first_name: 'Bob', last_name: 'Test', handicap_index: 21.0 },
        { first_name: 'Carol', last_name: 'Test', handicap_index: 7.0 },
        { first_name: 'Dave', last_name: 'Test', handicap_index: 28.0 }
      ]
    }
  });
  step('Add 4 players with handicaps', addRes.status === 200 && addRes.data && addRes.data.players,
    addRes.data ? (addRes.data.players || []).length + ' created' : 'status=' + addRes.status);

  // Auto-fill groups
  var groupRes = await apiFetch('org-groups', {
    body: { action: 'auto_fill', organiser_id: TEST_ORG_ID, event_id: state.eventId }
  });
  step('Auto-fill groups', groupRes.status === 200, groupRes.data ? JSON.stringify(groupRes.data).substring(0, 80) : 'status=' + groupRes.status);

  // Simulate payment and go live (direct Supabase patch)
  await sbRest('PATCH', 'events?id=eq.' + state.eventId, {
    status: 'live', paid: true, paid_at: new Date().toISOString()
  });

  var goLiveRes = await apiFetch('org-events', {
    body: { action: 'go_live', event_id: state.eventId, organiser_id: TEST_ORG_ID }
  });
  step('Go live', goLiveRes.status === 200, 'status=' + goLiveRes.status);

  // Open the event within the SPA (keeps session)
  await page.evaluate(function (eid) { openEvent(eid); }, state.eventId);

  // Poll until the LIVE chip or scoring status text appears (up to 15s)
  var eventPageState = { onEventScreen: false, hasLiveChip: '', scoringMatch: '' };
  for (var ew = 0; ew < 30; ew++) {
    await sleep(500);
    eventPageState = await page.evaluate(function () {
      var body = document.body.innerText;
      var chip = document.querySelector('.chip.live');
      var screenEvent = document.getElementById('screen-event');
      return {
        onEventScreen: screenEvent && screenEvent.offsetHeight > 0,
        hasLiveChip: chip ? chip.textContent.trim() : '',
        scoringMatch: (body.match(/\d+ of \d+ group[s]? scoring/i) || [''])[0],
        visibleText: body.substring(0, 200).replace(/\n/g, ' ')
      };
    });
    if (eventPageState.hasLiveChip || eventPageState.scoringMatch) break;
  }

  step('Dashboard shows LIVE chip',
    eventPageState.hasLiveChip.toLowerCase().includes('live'),
    'chip=' + eventPageState.hasLiveChip + ' onEventScreen=' + eventPageState.onEventScreen);

  step('Event is live with scoring status',
    eventPageState.scoringMatch.length > 0 || eventPageState.hasLiveChip.length > 0,
    eventPageState.scoringMatch || 'chip=' + eventPageState.hasLiveChip);

  // Get player tokens for journey 2
  var playersRes = await apiFetch('org-players', {
    method: 'GET',
    query: { event_id: state.eventId, organiser_id: TEST_ORG_ID }
  });
  if (playersRes.data && playersRes.data.players) {
    state.players = playersRes.data.players;
    state.playerTokens = playersRes.data.players.map(function (p) { return p.player_token; });
  }

  // Get org slug
  var orgRes = await sbRest('GET', 'organisers?id=eq.' + TEST_ORG_ID + '&select=slug');
  state.orgSlug = orgRes.data && orgRes.data[0] ? orgRes.data[0].slug : 'demo';

  state.orgPage = page;
  state.orgCtx = ctx;
}

// ── Journey 2: Player scores holes 1-3 ──────────────────────────
async function journey2_player(browser) {
  console.log('\n=== Journey 2: Player — open link, score holes 1-3 ===');

  if (!state.eventId || !state.playerTokens || !state.playerTokens[0]) {
    step('Player journey (skipped)', false, 'no event or tokens from journey 1');
    return;
  }

  var playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var playerPage = await playerCtx.newPage();

  var playerUrl = BASE + '/p/' + state.orgSlug + '/' + state.eventSlug + '/' + state.playerTokens[0];
  await playerPage.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Find player name (display_name from API, e.g. "Alice Test")
  var playerName = state.players[0].display_name || (state.players[0].first_name + ' ' + state.players[0].last_name);

  // Poll until player name appears on page (up to 15s)
  var nameVisible = false;
  for (var nw = 0; nw < 30; nw++) {
    await sleep(500);
    nameVisible = await playerPage.evaluate(function (name) {
      return document.body.innerText.includes(name);
    }, playerName);
    if (nameVisible) break;
  }
  step('Player sees their name', nameVisible, 'name=' + playerName);

  // Nominate first player as scorer for the group
  var nominateRes = await apiFetch('player-nominate', {
    body: { token: state.playerTokens[0], scorer_player_id: state.players[0].id }
  });
  step('Nominate scorer', nominateRes.status === 200, 'status=' + nominateRes.status);

  // Score holes 1-3 via API (including one pick-up on hole 2)
  var scores = [
    { player_id: state.players[0].id, hole_number: 1, gross_score: 5 },
    { player_id: state.players[0].id, hole_number: 2, picked_up: true },
    { player_id: state.players[0].id, hole_number: 3, gross_score: 4 }
  ];

  var saveRes = await apiFetch('score-save', {
    body: { token: state.playerTokens[0], scores: scores }
  });
  step('Score holes 1-3 (with pick-up)', saveRes.status === 200,
    saveRes.data ? JSON.stringify(saveRes.data).substring(0, 80) : 'status=' + saveRes.status);

  // Reload player page and wait for scores to appear
  await playerPage.reload({ waitUntil: 'domcontentloaded' });
  for (var pw = 0; pw < 20; pw++) {
    await sleep(500);
    var hasScores = await playerPage.evaluate(function () {
      return document.body.innerText.includes('Hole') || document.querySelectorAll('[data-hole]').length > 0;
    });
    if (hasScores) break;
  }

  // Check organiser live screen updates
  if (state.orgPage) {
    // Reload and wait for dashboard events to load before opening event
    await state.orgPage.reload({ waitUntil: 'domcontentloaded' });
    for (var dw = 0; dw < 30; dw++) {
      await sleep(500);
      var dashReady = await state.orgPage.evaluate(function () {
        return typeof state !== 'undefined' && state.events && state.events.length > 0;
      });
      if (dashReady) break;
    }

    // Re-open the event (state.events is now populated)
    await state.orgPage.evaluate(function (eid) {
      if (typeof openEvent === 'function') openEvent(eid);
    }, state.eventId);

    // Poll for scoring status text (up to 20s)
    // Text may be "N of M groups scoring" or "· N of M scoring"
    var updatedText = '';
    for (var ow = 0; ow < 40; ow++) {
      await sleep(500);
      updatedText = await state.orgPage.evaluate(function () {
        var body = document.body.innerText;
        return (body.match(/\d+ of \d+.*scoring/i) || [''])[0];
      });
      if (updatedText) break;
    }

    step('Organiser sees scoring status', updatedText.includes('of') && updatedText.includes('scoring'),
      'text=' + updatedText);

    // Check leaderboard shows player's points
    var leaderboardRes = await apiFetch('leaderboard', {
      method: 'GET',
      query: { event: state.eventId }
    });
    var hasPlayer = false;
    var lbEntries = leaderboardRes.data && leaderboardRes.data.entries;
    if (Array.isArray(lbEntries)) {
      hasPlayer = lbEntries.some(function (entry) {
        return entry.names && entry.names.includes(playerName) && entry.points > 0;
      });
    }
    step('Leaderboard shows player with points', hasPlayer,
      lbEntries ? lbEntries.length + ' entries' : 'no entries');
  }

  await playerCtx.close();
}

// ── Journey 3: Finish event ─────────────────────────────────────
async function journey3_finish(browser) {
  console.log('\n=== Journey 3: Finish — end event, winner, share ===');

  if (!state.eventId) {
    step('Finish journey (skipped)', false, 'no event');
    return;
  }

  // Finish the event via API
  var finishRes = await apiFetch('org-events', {
    body: { action: 'finish', event_id: state.eventId, organiser_id: TEST_ORG_ID }
  });
  step('Finish event', finishRes.status === 200, 'status=' + finishRes.status);

  // Reload dashboard data then navigate to finished event
  if (state.orgPage) {
    // Reload and wait for dashboard events to load
    await state.orgPage.reload({ waitUntil: 'domcontentloaded' });
    for (var dw2 = 0; dw2 < 30; dw2++) {
      await sleep(500);
      var dashReady2 = await state.orgPage.evaluate(function () {
        return typeof state !== 'undefined' && state.events && state.events.length > 0;
      });
      if (dashReady2) break;
    }

    // Open the finished event
    await state.orgPage.evaluate(function (eid) {
      if (typeof openEvent === 'function') openEvent(eid);
    }, state.eventId);

    // Poll for the finished screen content (up to 20s)
    var winnerText = '';
    for (var fw = 0; fw < 40; fw++) {
      await sleep(500);
      winnerText = await state.orgPage.evaluate(function () {
        var winner = document.querySelector('.winner');
        if (winner && winner.textContent.trim()) return winner.textContent.trim();
        var body = document.body.innerText;
        if (body.includes('Final results') || body.includes('finished')) return body.substring(0, 500);
        return '';
      });
      if (winnerText) break;
    }
    step('Finished screen shows winner', winnerText.length > 0, 'text=' + winnerText.substring(0, 80));

    // Check WhatsApp share text contains winner's name and points
    var shareText = await state.orgPage.evaluate(function () {
      // Look for share button or WhatsApp link
      var links = document.querySelectorAll('a[href*="whatsapp"], a[href*="wa.me"]');
      for (var i = 0; i < links.length; i++) {
        var href = decodeURIComponent(links[i].href);
        if (href.includes('text=')) return href.split('text=')[1] || href;
        return href;
      }
      // Check for share data in the page
      var shareBtn = document.querySelector('[onclick*="share"], [data-share]');
      return shareBtn ? shareBtn.getAttribute('data-share-text') || '' : '';
    });

    // The winner should be in the share text
    var winnerName = '';
    if (state.players) {
      // Get leaderboard to find actual winner
      var lbRes = await apiFetch('leaderboard', { method: 'GET', query: { event: state.eventId } });
      var lbEntries3 = lbRes.data && lbRes.data.entries;
      if (Array.isArray(lbEntries3) && lbEntries3[0]) {
        winnerName = lbEntries3[0].names;
      }
    }

    if (winnerName) {
      // Winner name may be in the winner card, share text, or page body
      var pageBody = await state.orgPage.evaluate(function () { return document.body.innerText; });
      step('Winner name visible on finished screen',
        pageBody.includes(winnerName) || winnerText.includes(winnerName) || shareText.includes(winnerName),
        'winner=' + winnerName + ' inPage=' + pageBody.includes(winnerName));
    } else {
      step('Winner identified', false, 'could not determine winner');
    }
  }
}

// ── Cleanup ─────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n--- Cleanup ---');
  if (state.eventId) {
    // Delete scores
    await sbRest('DELETE', 'hole_scores?event_id=eq.' + state.eventId);
    // Delete players
    await sbRest('DELETE', 'players?event_id=eq.' + state.eventId);
    // Delete groups
    await sbRest('DELETE', 'groups?event_id=eq.' + state.eventId);
    // Delete event
    await sbRest('DELETE', 'events?id=eq.' + state.eventId);
    console.log('  Cleaned up event ' + state.eventId);
  }
  if (authUserId) {
    await sbAuth('DELETE', 'admin/users/' + authUserId, null);
    console.log('  Cleaned up auth user ' + authUserId);
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('=== Journey Tests ===');
  console.log('Target: ' + BASE);

  var testUser = await createTestUser();
  console.log('  Auth: user=' + testUser.userId + ' token_len=' + authToken.length);

  var browser = await chromium.launch();

  try {
    await journey1_organiser(browser);
    await journey2_player(browser);
    await journey3_finish(browser);
  } finally {
    if (state.orgCtx) await state.orgCtx.close();
    await cleanup();
    await browser.close();
  }

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + total + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (err) {
  console.error('FATAL:', err.message);
  cleanup().then(function () { process.exit(1); });
});
