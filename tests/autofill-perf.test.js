// autofill-perf.test.js — Performance and correctness tests for autofill
// Run: SUPABASE_SERVICE_KEY=xxx node tests/autofill-perf.test.js [--url <base>]

'use strict';

var https = require('https');
var crypto = require('crypto');

var args = process.argv.slice(2);
var urlFlag = args.indexOf('--url');
var BASE = urlFlag !== -1 && args[urlFlag + 1] ? args[urlFlag + 1] : 'https://outofboundsscoring.netlify.app';
var HOST = BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY = process.env.SUPABASE_SERVICE_KEY;
var ORG_ID = 'a0000000-0000-0000-0000-000000000001';

var passed = 0;
var failed = 0;

function step(label, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + label + (detail ? ' — ' + detail : '')); }
  else    { failed++; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

function req(host, m, p, b, h) {
  return new Promise(function (r, j) {
    var d = b ? JSON.stringify(b) : null;
    var H = Object.assign({ 'Content-Type': 'application/json' }, h || {});
    if (d) H['Content-Length'] = Buffer.byteLength(d);
    var o = { hostname: host, port: 443, path: p, method: m, headers: H };
    var t = Date.now();
    var q = https.request(o, function (s) {
      var c = [];
      s.on('data', function (x) { c.push(x); });
      s.on('end', function () {
        var raw = Buffer.concat(c).toString();
        try { r({ s: s.statusCode, d: JSON.parse(raw), ms: Date.now() - t }); }
        catch (e) { r({ s: s.statusCode, d: raw.slice(0, 200), ms: Date.now() - t }); }
      });
    });
    q.on('error', j);
    if (d) q.write(d);
    q.end();
  });
}

var SH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=representation' };
function apiFetch(fn, body) { return req(HOST, 'POST', '/.netlify/functions/' + fn, body); }
function sbGet(p) { return req(SB_HOST, 'GET', '/rest/v1/' + p, null, { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }); }
function sbPost(p, b) { return req(SB_HOST, 'POST', '/rest/v1/' + p, b, SH); }
function sbPatch(p, b) { return req(SB_HOST, 'PATCH', '/rest/v1/' + p, b, { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }); }
function sbDel(p) { return req(SB_HOST, 'DELETE', '/rest/v1/' + p, null, SH); }

async function createEvent() {
  var ev = await apiFetch('org-events', {
    organiser_id: ORG_ID, name: 'AF Perf ' + Date.now(),
    format: 'better_ball_2from4',
    course_id: 'c0000000-0000-0000-0000-000000000001',
    tee_id: 'd0000000-0000-0000-0000-000000000001',
    handicap_allowance: 0.85
  });
  return ev.d.event ? ev.d.event.id : null;
}

async function addPlayers(eventId, count) {
  var players = [];
  for (var i = 1; i <= count; i++) players.push({ name: 'P' + i, handicap_index: 10 + (i % 20) });
  await apiFetch('org-players', { organiser_id: ORG_ID, event_id: eventId, action: 'bulk_add', players: players });
}

async function resetGroups(eventId) {
  await sbDel('groups?event_id=eq.' + eventId);
  await sbPatch('players?event_id=eq.' + eventId + '&group_id=not.is.null', { group_id: null, pair_key: null });
}

async function cleanup(eventId) {
  await sbDel('hole_scores?event_id=eq.' + eventId);
  await sbDel('score_edits?event_id=eq.' + eventId);
  await sbDel('players?event_id=eq.' + eventId);
  await sbDel('groups?event_id=eq.' + eventId);
  await sbDel('events?id=eq.' + eventId);
}

async function main() {
  console.log('=== Autofill Performance Test ===');
  console.log('Target: ' + BASE);

  if (!SB_KEY) { console.error('FATAL: SUPABASE_SERVICE_KEY not set.'); process.exit(1); }

  var eventId72 = null;
  var eventId144 = null;

  try {
    // ── 72 players ──
    console.log('\n--- 72 players ---');
    eventId72 = await createEvent();
    step('Create event (72)', !!eventId72);
    if (!eventId72) throw new Error('No event');
    await addPlayers(eventId72, 72);

    // Cold
    var r1 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId72, organiser_id: ORG_ID });
    step('72 autofill COLD', r1.s === 200 && r1.d.ok, r1.ms + 'ms  groups=' + r1.d.groups_created);
    console.log('  COLD: ' + r1.ms + 'ms');

    await resetGroups(eventId72);
    var r2 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId72, organiser_id: ORG_ID });
    step('72 autofill WARM1 under 3s', r2.s === 200 && r2.ms < 3000, r2.ms + 'ms');
    console.log('  WARM1: ' + r2.ms + 'ms');

    await resetGroups(eventId72);
    var r3 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId72, organiser_id: ORG_ID });
    step('72 autofill WARM2 under 3s', r3.s === 200 && r3.ms < 3000, r3.ms + 'ms');
    console.log('  WARM2: ' + r3.ms + 'ms');

    // ── Correctness: pairs, group numbers, scores preserved ──
    console.log('\n--- Correctness ---');

    // Check pairs
    var playersData = await sbGet('players?event_id=eq.' + eventId72 + '&group_id=not.is.null&select=id,group_id,pair_key&order=group_id');
    var byGroup = {};
    (playersData.d || []).forEach(function (p) {
      if (!byGroup[p.group_id]) byGroup[p.group_id] = [];
      byGroup[p.group_id].push(p);
    });
    var pairsOk = true;
    var groupNums = [];
    Object.keys(byGroup).forEach(function (gid) {
      var members = byGroup[gid];
      // For better_ball_2from4, pair_key should be null (only set for better_ball_pairs)
      // Just check group size = 4
      if (members.length !== 4 && members.length > 0) pairsOk = false;
    });
    step('All groups have 4 players', pairsOk, Object.keys(byGroup).length + ' groups');

    // Check no duplicate group numbers
    var groups = await sbGet('groups?event_id=eq.' + eventId72 + '&select=group_number&order=group_number');
    var nums = (groups.d || []).map(function (g) { return g.group_number; });
    var dupes = nums.filter(function (n, i) { return nums.indexOf(n) !== i; });
    step('No duplicate group numbers', dupes.length === 0, 'numbers: 1..' + nums[nums.length - 1]);

    // Check scored players keep scores when moved
    // Add a score for player 1, reset groups, re-autofill, check score still exists
    var p1 = (playersData.d || [])[0];
    if (p1) {
      await sbPost('hole_scores', { event_id: eventId72, player_id: p1.id, hole_number: 1, gross_score: 5 });
      await resetGroups(eventId72);
      await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId72, organiser_id: ORG_ID });
      var scores = await sbGet('hole_scores?event_id=eq.' + eventId72 + '&player_id=eq.' + p1.id + '&select=gross_score');
      step('Scored player keeps score after re-autofill', scores.d && scores.d.length > 0 && scores.d[0].gross_score === 5);
    }

    // ── Pairs format: 72 players, better_ball_pairs ──
    console.log('\n--- 72 players (pairs format) ---');
    var pairsEventId = null;
    var pairsEv = await apiFetch('org-events', {
      organiser_id: ORG_ID, name: 'AF Pairs ' + Date.now(),
      format: 'better_ball_pairs',
      course_id: 'c0000000-0000-0000-0000-000000000001',
      tee_id: 'd0000000-0000-0000-0000-000000000001',
      handicap_allowance: 0.85
    });
    pairsEventId = pairsEv.d.event ? pairsEv.d.event.id : null;
    step('Create pairs event', !!pairsEventId);
    if (pairsEventId) {
      await addPlayers(pairsEventId, 72);

      var pr = await apiFetch('org-groups', { action: 'auto_fill', event_id: pairsEventId, organiser_id: ORG_ID });
      step('Pairs autofill', pr.s === 200 && pr.d.ok, pr.ms + 'ms');
      console.log('  Pairs: ' + pr.ms + 'ms');

      // Check every group has exactly 2 A and 2 B
      var pairsPlayers = await sbGet('players?event_id=eq.' + pairsEventId + '&group_id=not.is.null&select=id,group_id,pair_key');
      var pairsByGroup = {};
      (pairsPlayers.d || []).forEach(function (p) {
        if (!pairsByGroup[p.group_id]) pairsByGroup[p.group_id] = { A: 0, B: 0 };
        if (p.pair_key === 'A') pairsByGroup[p.group_id].A++;
        else if (p.pair_key === 'B') pairsByGroup[p.group_id].B++;
      });
      var pairsCorrect = true;
      var badGroups = [];
      Object.keys(pairsByGroup).forEach(function (gid) {
        var g = pairsByGroup[gid];
        if (g.A !== 2 || g.B !== 2) {
          pairsCorrect = false;
          badGroups.push('A=' + g.A + ' B=' + g.B);
        }
      });
      step('Every group has exactly 2 pairs (2A + 2B)', pairsCorrect,
        Object.keys(pairsByGroup).length + ' groups' + (badGroups.length ? ', bad: ' + badGroups.join('; ') : ''));

      // No group has 3 from one pair
      var threeFromOnePair = false;
      Object.keys(pairsByGroup).forEach(function (gid) {
        var g = pairsByGroup[gid];
        if (g.A >= 3 || g.B >= 3) threeFromOnePair = true;
      });
      step('No group has 3 from one pair key', !threeFromOnePair);

      await cleanup(pairsEventId);
    }

    // ── 144 players ──
    console.log('\n--- 144 players ---');
    eventId144 = await createEvent();
    step('Create event (144)', !!eventId144);
    if (!eventId144) throw new Error('No event');
    await addPlayers(eventId144, 144);

    var r4 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId144, organiser_id: ORG_ID });
    step('144 autofill COLD', r4.s === 200 && r4.d.ok, r4.ms + 'ms  groups=' + r4.d.groups_created);
    console.log('  COLD: ' + r4.ms + 'ms');

    await resetGroups(eventId144);
    var r5 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId144, organiser_id: ORG_ID });
    step('144 autofill WARM1 under 4s', r5.s === 200 && r5.ms < 4000, r5.ms + 'ms');
    console.log('  WARM1: ' + r5.ms + 'ms');

    await resetGroups(eventId144);
    var r6 = await apiFetch('org-groups', { action: 'auto_fill', event_id: eventId144, organiser_id: ORG_ID });
    step('144 autofill WARM2 under 4s', r6.s === 200 && r6.ms < 4000, r6.ms + 'ms');
    console.log('  WARM2: ' + r6.ms + 'ms');

    // Check 144 players: 36 groups of 4
    var groups144 = await sbGet('groups?event_id=eq.' + eventId144 + '&select=group_number');
    step('144 players: 36 groups', groups144.d && groups144.d.length === 36, groups144.d ? groups144.d.length + ' groups' : 'no data');

    var dupes144 = (groups144.d || []).map(function (g) { return g.group_number; }).filter(function (n, i, a) { return a.indexOf(n) !== i; });
    step('144: no duplicate group numbers', dupes144.length === 0);

  } catch (err) {
    step('Unexpected error', false, err.message);
  }

  // Cleanup
  if (eventId72) await cleanup(eventId72);
  if (eventId144) await cleanup(eventId144);

  console.log('\n=== Summary ===');
  console.log(passed + ' of ' + (passed + failed) + ' steps passed');
  if (failed > 0) console.log(failed + ' FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

main();
