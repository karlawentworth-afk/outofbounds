#!/usr/bin/env node
'use strict';

/**
 * Seed the demo organiser with realistic data.
 * Idempotent: deletes existing demo data, then re-creates.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=xxx node scripts/seed-demo.js
 *
 * Also called by the demo-reset Netlify function.
 */

var https = require('https');
var crypto = require('crypto');

var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SB_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// ── Supabase helpers ──────────────────────────────────────────

function sbRequest(method, path, body) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var opts = { hostname: SB_HOST, port: 443, path: '/rest/v1/' + path, method: method, headers: headers };
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) { reject(new Error('SB ' + res.statusCode + ': ' + raw.slice(0, 300))); return; }
        try { resolve(raw ? JSON.parse(raw) : null); } catch (e) { resolve(null); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sbGet(p) { return sbRequest('GET', p, null); }
function sbPost(p, b) { return sbRequest('POST', p, b); }
function sbPatch(p, b) { return sbRequest('PATCH', p, b); }
function sbDelete(p) { return sbRequest('DELETE', p, null); }

function uuid() { return crypto.randomUUID(); }
function token() { return crypto.randomBytes(16).toString('hex'); }

// ── Constants ─────────────────────────────────────────────────

var DEMO_ORG_ID = 'a0000000-0000-0000-0000-000000000099';
var DEMO_SLUG   = 'demo';

// Fixed scorer tokens for QR cards (first 3 groups of live event)
var FIXED_TOKENS = [
  'demo-scorer-group-001-token',
  'demo-scorer-group-002-token',
  'demo-scorer-group-003-token'
];

// ── Course data ───────────────────────────────────────────────

var COURSES = [
  {
    id: 'c0000000-0000-0000-0000-000000000010',
    name: 'Carden Park — Cheshire',
    club: 'Carden Park Hotel',
    verified: true,
    tees: [
      { id: 'd0000000-0000-0000-0000-000000000010', colour: 'White', rating_gender: 'men', rating: 72.4, slope: 133,
        pars: [4,4,3,4,5,4,3,4,5,4,3,5,4,4,3,4,5,4], sis: [7,3,15,1,11,9,17,5,13,8,16,2,10,6,18,14,4,12] },
      { id: 'd0000000-0000-0000-0000-000000000011', colour: 'Yellow', rating_gender: 'men', rating: 70.8, slope: 128,
        pars: [4,4,3,4,5,4,3,4,5,4,3,5,4,4,3,4,5,4], sis: [7,3,15,1,11,9,17,5,13,8,16,2,10,6,18,14,4,12] },
      { id: 'd0000000-0000-0000-0000-000000000012', colour: 'Red', rating_gender: 'women', rating: 73.2, slope: 131,
        pars: [4,4,3,4,5,4,3,4,5,4,3,5,4,4,3,4,5,4], sis: [7,3,15,1,11,9,17,5,13,8,16,2,10,6,18,14,4,12] }
    ]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000011',
    name: 'Riverside GC',
    club: 'Riverside Golf Club',
    verified: false,
    tees: [
      { id: 'd0000000-0000-0000-0000-000000000020', colour: 'White', rating_gender: 'men', rating: 74.1, slope: 138,
        pars: [4,4,4,3,4,5,4,3,4,4,4,3,5,3,5,4,5,4], sis: [5,9,1,17,7,3,11,15,13,6,4,18,2,16,8,14,10,12] },
      { id: 'd0000000-0000-0000-0000-000000000021', colour: 'Yellow', rating_gender: 'men', rating: 72.3, slope: 132,
        pars: [4,4,4,3,4,5,4,3,4,4,4,3,5,3,5,4,5,4], sis: [5,9,1,17,7,3,11,15,13,6,4,18,2,16,8,14,10,12] }
    ]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000012',
    name: 'Hartley Park',
    club: 'Hartley Park Golf Club',
    verified: false,
    tees: [
      { id: 'd0000000-0000-0000-0000-000000000030', colour: 'Yellow', rating_gender: 'men', rating: 70.2, slope: 126,
        pars: [4,5,3,4,4,3,5,4,4,4,3,4,5,4,3,4,5,4], sis: [9,3,17,1,7,15,5,11,13,4,18,8,2,12,16,6,10,14] },
      { id: 'd0000000-0000-0000-0000-000000000031', colour: 'Red', rating_gender: 'women', rating: 72.8, slope: 129,
        pars: [4,5,3,4,4,3,5,4,4,4,3,4,5,4,3,4,5,4], sis: [9,3,17,1,7,15,5,11,13,4,18,8,2,12,16,6,10,14] }
    ]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000013',
    name: 'Moorcroft',
    club: 'Moorcroft Golf Club',
    verified: false,
    tees: [
      { id: 'd0000000-0000-0000-0000-000000000040', colour: 'Yellow', rating_gender: 'men', rating: 69.4, slope: 124,
        pars: [4,3,4,5,4,3,4,4,5,3,4,4,5,4,3,4,4,5], sis: [3,15,7,1,9,17,5,11,13,18,8,6,2,10,16,4,14,12] },
      { id: 'd0000000-0000-0000-0000-000000000041', colour: 'Red', rating_gender: 'women', rating: 71.6, slope: 127,
        pars: [4,3,4,5,4,3,4,4,5,3,4,4,5,4,3,4,4,5], sis: [3,15,7,1,9,17,5,11,13,18,8,6,2,10,16,4,14,12] }
    ]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000014',
    name: 'Ashdown Heath',
    club: 'Ashdown Heath Golf Club',
    verified: false,
    tees: [
      { id: 'd0000000-0000-0000-0000-000000000050', colour: 'Yellow', rating_gender: 'men', rating: 68.9, slope: 121,
        pars: [4,4,3,5,4,4,3,4,5,4,3,5,4,4,3,4,5,4], sis: [5,1,15,9,7,3,17,11,13,6,18,2,8,4,16,14,10,12] }
    ]
  }
];

// ── People ────────────────────────────────────────────────────

var FIRST_NAMES_M = ['James','David','Mark','Paul','Andrew','Chris','Michael','John','Robert','Stephen','Peter','Tom','Daniel','Richard','Simon','Gary','Phil','Neil','Matt','Ian','Ben','Nick','Alex','Sam','Will','Luke','Adam','George','Harry','Jack','Charlie','Oliver','Lewis','Ryan','Scott','Craig','Lee','Dean','Colin','Keith','Brian','Alan','Derek','Graham','Wayne','Darren','Gareth','Stuart','Barry','Nigel'];
var FIRST_NAMES_F = ['Sarah','Emma','Karen','Lisa','Claire','Helen','Laura','Julie','Jane','Rachel','Debbie','Michelle','Angela','Linda','Carol','Christine','Andrea','Joanne','Sandra','Nicola','Alison','Tracy','Sharon','Louise','Dawn','Diane','Wendy','Anne','Marie','Gill','Kate','Fiona','Sue','Janet','Maggie','Elaine','Jackie','Barbara','Lorraine','Donna'];
var LAST_NAMES = ['Smith','Jones','Williams','Brown','Taylor','Wilson','Johnson','Davies','Robinson','Wright','Thompson','Evans','Walker','White','Roberts','Green','Hall','Thomas','Clarke','Jackson','Wood','Harris','Turner','Martin','Cooper','Hill','Ward','Morris','Moore','Clark','Lee','King','Baker','Harrison','Morgan','Allen','James','Scott','Phillips','Watson','Davis','Parker','Bennett','Edwards','Brooks','Kelly','Mitchell','Cook','Bailey','Collins','Shaw','Murray','Bell','Young','Hughes','Foster','Price','Russell','Gray','Barnes'];

function buildPeople() {
  var people = [];
  var usedNames = {};

  function addPerson(first, last, gender) {
    var key = first + ' ' + last;
    if (usedNames[key]) return null;
    usedNames[key] = true;

    var hi = Math.round((4 + Math.random() * 32) * 10) / 10;
    var hasEmail = Math.random() < 0.9;
    var email = hasEmail ? first.toLowerCase() + '.' + last.toLowerCase() + '@example.com' : null;

    people.push({
      first_name: first,
      last_name: last,
      handicap_index: hi,
      email: email,
      _rating: gender
    });
    return people[people.length - 1];
  }

  // 80 men, 40 women
  while (people.length < 80) {
    var f = FIRST_NAMES_M[Math.floor(Math.random() * FIRST_NAMES_M.length)];
    var l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    addPerson(f, l, 'men');
  }
  while (people.length < 120) {
    var f = FIRST_NAMES_F[Math.floor(Math.random() * FIRST_NAMES_F.length)];
    var l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    addPerson(f, l, 'women');
  }

  // Spread last_event_at over the season (April–September)
  var year = new Date().getFullYear();
  people.forEach(function (p, i) {
    var month = 3 + Math.floor(Math.random() * 6); // April (3) to September (8)
    var day = 1 + Math.floor(Math.random() * 28);
    p.last_event_at = new Date(year, month, day).toISOString();
    p.events_count = 1 + Math.floor(Math.random() * 4);
  });

  return people;
}

// ── Score generation ──────────────────────────────────────────

function computePH(hi, slope, rating, parTotal, allowance) {
  if (hi == null) return null;
  var ch = Math.round(hi * (slope / 113));
  var adj = ch + (Math.round(rating) - parTotal);
  return Math.max(0, Math.min(54, Math.round(adj * allowance)));
}

function generateScore(par, ph, holeNumber, si) {
  // Simulates a realistic score: most pars and bogeys, occasional birdie or double
  var extra = si <= ph ? 1 : 0; // stroke received
  var base = par + extra;
  var r = Math.random();
  var gross;
  if (r < 0.03) gross = base - 2; // eagle/great
  else if (r < 0.15) gross = base - 1; // birdie/net birdie
  else if (r < 0.50) gross = base; // par/net par
  else if (r < 0.80) gross = base + 1; // bogey
  else if (r < 0.92) gross = base + 2; // double
  else gross = base + 3; // triple+

  return Math.max(1, gross);
}

// ── Events configuration ──────────────────────────────────────

var today = new Date();
var thisYear = today.getFullYear();

function dateStr(m, d) {
  return thisYear + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function todayStr() {
  return today.toISOString().slice(0, 10);
}

function nextMonthStr() {
  var nm = new Date(today);
  nm.setMonth(nm.getMonth() + 1);
  return nm.toISOString().slice(0, 10);
}

var EVENTS = [
  { name: 'Spring Charity Classic', date: dateStr(4, 18), format: 'better_ball_2from4', playerCount: 72, courseIdx: 0, teeIdx: 1, status: 'finished', sponsorSlides: true },
  { name: 'May Society Day', date: dateStr(5, 10), format: 'individual_stableford', playerCount: 24, courseIdx: 1, teeIdx: 0, status: 'finished' },
  { name: 'Corporate Challenge', date: dateStr(6, 14), format: 'better_ball_2from4', playerCount: 48, courseIdx: 2, teeIdx: 0, status: 'finished', mixedField: true },
  { name: 'Summer Club Open', date: dateStr(7, 5), format: 'individual_stableford', playerCount: 60, courseIdx: 3, teeIdx: 0, status: 'finished' },
  { name: 'Pairs Better Ball', date: dateStr(8, 9), format: 'better_ball_pairs', playerCount: 32, courseIdx: 4, teeIdx: 0, status: 'finished' },
  { name: 'Thursday Evening 9', date: dateStr(8, 22), format: 'individual_stableford', playerCount: 16, courseIdx: 3, teeIdx: 0, status: 'finished', nineHole: true },
  { name: 'Autumn Invitational', date: todayStr(), format: 'better_ball_2from4', playerCount: 36, courseIdx: 0, teeIdx: 1, status: 'live', sponsorSlides: true, isLive: true },
  { name: 'Winter Warm-Up', date: nextMonthStr(), format: 'individual_stableford', playerCount: 40, courseIdx: 1, teeIdx: 0, status: 'draft', isDraft: true }
];

// ── Main seed ─────────────────────────────────────────────────

async function seed() {
  console.log('=== Demo Seed ===\n');

  // 1. Delete existing demo data
  console.log('Cleaning existing demo data...');
  var existingOrgs = await sbGet('organisers?slug=eq.' + DEMO_SLUG + '&select=id');
  if (existingOrgs && existingOrgs.length) {
    var oldId = existingOrgs[0].id;
    // Delete in order to respect FKs
    await sbDelete('send_log?organiser_id=eq.' + oldId);
    await sbDelete('score_edits?organiser_id=eq.' + oldId).catch(function () {});

    var oldEvents = await sbGet('events?organiser_id=eq.' + oldId + '&select=id');
    for (var i = 0; i < (oldEvents || []).length; i++) {
      await sbDelete('hole_scores?event_id=eq.' + oldEvents[i].id);
      await sbDelete('score_edits?event_id=eq.' + oldEvents[i].id);
      await sbDelete('payments?event_id=eq.' + oldEvents[i].id);
      // Null out scorer FK before deleting players
      await sbPatch('groups?event_id=eq.' + oldEvents[i].id, { scorer_player_id: null }).catch(function(){});
      await sbDelete('players?event_id=eq.' + oldEvents[i].id);
      await sbDelete('groups?event_id=eq.' + oldEvents[i].id);
    }
    await sbDelete('events?organiser_id=eq.' + oldId);
    await sbDelete('people?organiser_id=eq.' + oldId);
    await sbDelete('plan_events?organiser_id=eq.' + oldId);
    await sbDelete('branding_versions?organiser_id=eq.' + oldId);
    // Delete courses contributed by this org before deleting the organiser
    await sbDelete('course_holes?course_id=in.(' + COURSES.map(function(c){return c.id;}).join(',') + ')').catch(function(){});
    await sbDelete('course_tees?course_id=in.(' + COURSES.map(function(c){return c.id;}).join(',') + ')').catch(function(){});
    await sbDelete('courses?contributed_by=eq.' + oldId).catch(function(){});
    await sbDelete('organisers?id=eq.' + oldId);
    console.log('  Deleted organiser ' + oldId);
  }

  // Also clean up fixed-ID data
  for (var ci = 0; ci < COURSES.length; ci++) {
    var c = COURSES[ci];
    await sbDelete('course_holes?course_id=eq.' + c.id).catch(function(){});
    for (var ti = 0; ti < c.tees.length; ti++) {
      await sbDelete('course_tees?id=eq.' + c.tees[ti].id).catch(function(){});
    }
    await sbDelete('courses?id=eq.' + c.id).catch(function(){});
  }

  // 2. Create organiser
  console.log('Creating demo organiser...');
  await sbPost('organisers', {
    id: DEMO_ORG_ID,
    slug: DEMO_SLUG,
    name: 'Fairway Events',
    display_name: 'Fairway Events',
    primary_colour: '#1A5276',
    accent_colour: '#E67E22',
    text_on_primary: '#FFFFFF',
    contact_email: 'demo@outofboundsevents.com',
    plan: 'pro',
    plan_source: 'comp',
    comp_until: '2099-12-31T23:59:59Z',
    active: true
  });
  console.log('  Organiser: Fairway Events (' + DEMO_ORG_ID + ')');

  // 3. Create courses
  console.log('Creating courses...');
  for (var ci = 0; ci < COURSES.length; ci++) {
    var c = COURSES[ci];
    await sbPost('courses', {
      id: c.id,
      name: c.name,
      club: c.club,
      verified: c.verified,
      contributed_by: DEMO_ORG_ID
    });

    for (var ti = 0; ti < c.tees.length; ti++) {
      var t = c.tees[ti];
      var parTotal = t.pars.reduce(function (a, b) { return a + b; }, 0);
      await sbPost('course_tees', {
        id: t.id,
        course_id: c.id,
        tee_name: t.colour,
        colour: t.colour.toLowerCase(),
        rating_gender: t.rating_gender,
        rating: t.rating,
        slope: t.slope,
        par_total: parTotal,
        number_of_holes: 18
      });

      // Insert holes only for the first tee (shared across tees in this schema)
      if (ti === 0) {
        for (var h = 0; h < 18; h++) {
          await sbPost('course_holes', {
            course_id: c.id,
            hole_number: h + 1,
            par: t.pars[h],
            stroke_index: t.sis[h]
          });
        }
      }
    }
    console.log('  Course: ' + c.name + ' (' + c.tees.length + ' tees)');
  }

  // 4. Create people
  console.log('Creating people...');
  var allPeople = buildPeople();
  var personIds = [];

  for (var pi = 0; pi < allPeople.length; pi++) {
    var p = allPeople[pi];
    var created = await sbPost('people', {
      organiser_id: DEMO_ORG_ID,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      handicap_index: p.handicap_index,
      source: 'typed',
      last_event_at: p.last_event_at,
      events_count: p.events_count
    });
    var person = Array.isArray(created) ? created[0] : created;
    personIds.push(person.id);
    allPeople[pi].personId = person.id;
  }
  console.log('  Created ' + personIds.length + ' people');

  // 5. Create events
  console.log('Creating events...');
  var usedPeopleIdx = 0;

  for (var ei = 0; ei < EVENTS.length; ei++) {
    var ev = EVENTS[ei];
    var course = COURSES[ev.courseIdx];
    var tee = course.tees[ev.teeIdx];
    var parTotal = tee.pars.reduce(function (a, b) { return a + b; }, 0);
    var holeCount = ev.nineHole ? 9 : 18;

    var eventId = uuid();
    var eventSlug = ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    var eventRow = {
      id: eventId,
      organiser_id: DEMO_ORG_ID,
      slug: eventSlug,
      name: ev.name,
      event_date: ev.date,
      format: ev.format,
      course_id: course.id,
      tee_id: tee.id,
      handicap_allowance: 0.85,
      max_handicap: 54,
      starting_mode: 'tee_times',
      leaderboard_freeze_hole: 12,
      status: ev.status,
      paid: ev.status !== 'draft',
      paid_at: ev.status !== 'draft' ? new Date().toISOString() : null
    };

    if (ev.status === 'finished') {
      eventRow.locked_at = new Date().toISOString();
      eventRow.results_published = true;
      eventRow.results_published_at = new Date().toISOString();
    }

    await sbPost('events', eventRow);

    // Select players from the people pool
    var eventPeople = [];
    var count = Math.min(ev.playerCount, allPeople.length);

    // For mixed field events, include women with women's tees
    for (var pp = 0; pp < count; pp++) {
      var idx = (usedPeopleIdx + pp) % allPeople.length;
      eventPeople.push(allPeople[idx]);
    }
    usedPeopleIdx = (usedPeopleIdx + count) % allPeople.length;

    // Create groups (4 per group)
    var groupSize = 4;
    var groupCount = Math.ceil(eventPeople.length / groupSize);
    var groups = [];

    for (var gi = 0; gi < groupCount; gi++) {
      var groupId = uuid();
      var teeHour = 8 + Math.floor(gi / 6);
      var teeMin = (gi % 6) * 10;

      await sbPost('groups', {
        id: groupId,
        event_id: eventId,
        group_number: gi + 1,
        tee_time: String(teeHour).padStart(2, '0') + ':' + String(teeMin).padStart(2, '0'),
        starting_hole: 1
      });
      groups.push(groupId);
    }

    // Create players and assign to groups
    var players = [];
    for (var pp = 0; pp < eventPeople.length; pp++) {
      var person = eventPeople[pp];
      var groupIdx = Math.floor(pp / groupSize);
      var isFirstInGroup = pp % groupSize === 0;

      // For mixed field, use women's tee for women
      var playerTee = tee;
      if (ev.mixedField && person._rating === 'women' && course.tees.length > 1) {
        playerTee = course.tees[course.tees.length - 1]; // last tee is women's
      }

      var ph = computePH(person.handicap_index, playerTee.slope, playerTee.rating, parTotal, 0.85);

      var playerToken;
      // Fixed tokens for first 3 groups of live event
      if (ev.isLive && isFirstInGroup && groupIdx < 3) {
        playerToken = FIXED_TOKENS[groupIdx];
      } else {
        playerToken = ev.isDraft ? null : token();
      }

      // Fixed-token demo players are pre-confirmed so they skip the confirm screen
      var isFixedDemo = ev.isLive && isFirstInGroup && groupIdx < 3;

      var playerRow = {
        event_id: eventId,
        first_name: person.first_name,
        last_name: person.last_name,
        display_name: person.first_name + ' ' + person.last_name,
        email: person.email,
        handicap_index: person.handicap_index,
        playing_handicap: ph,
        group_id: ev.isDraft ? null : groups[groupIdx],
        player_token: playerToken || token(),
        player_status: isFixedDemo ? 'confirmed' : 'invited',
        handicap_source: isFixedDemo ? 'player' : 'organiser'
      };

      var createdPlayer = await sbPost('players', playerRow);
      var player = Array.isArray(createdPlayer) ? createdPlayer[0] : createdPlayer;
      players.push({ id: player.id, ph: ph, groupIdx: groupIdx, tee: playerTee });

      // Set scorer for first player in each group
      if (isFirstInGroup && !ev.isDraft) {
        await sbPatch('groups?id=eq.' + groups[groupIdx], {
          scorer_player_id: player.id
        });
      }
    }

    // Generate scores (not for draft)
    if (ev.status !== 'draft') {
      var scoresToInsert = [];

      for (var pp = 0; pp < players.length; pp++) {
        var player = players[pp];
        var playerTee = player.tee;
        var maxHole = holeCount;

        // Live event: score holes 1-11, with gaps
        if (ev.isLive) {
          if (player.groupIdx >= 7) maxHole = 8; // trailing groups
          else if (player.groupIdx >= 5) maxHole = 10;
          else maxHole = 11;

          // One group amber (no score for 45 min) — group 5
          // One group red (missing hole) — group 6
        }

        for (var h = 1; h <= maxHole; h++) {
          // Skip hole 7 for group 6 (red — gap)
          if (ev.isLive && player.groupIdx === 6 && h === 7) continue;

          var par = playerTee.pars[h - 1];
          var si = playerTee.sis[h - 1];
          var gross = generateScore(par, player.ph, h, si);

          scoresToInsert.push({
            event_id: eventId,
            player_id: player.id,
            hole_number: h,
            gross_score: gross
          });
        }
      }

      // Insert scores in batches of 100
      for (var si = 0; si < scoresToInsert.length; si += 100) {
        var batch = scoresToInsert.slice(si, si + 100);
        await sbPost('hole_scores', batch);
      }

      // For live event, make group 5 scores stale (45 min ago)
      if (ev.isLive) {
        var staleTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
        var g5Players = players.filter(function (p) { return p.groupIdx === 5; });
        for (var sp = 0; sp < g5Players.length; sp++) {
          await sbPatch(
            'hole_scores?player_id=eq.' + g5Players[sp].id + '&event_id=eq.' + eventId,
            { updated_at: staleTime }
          );
        }
      }

      console.log('  Event: ' + ev.name + ' (' + players.length + ' players, ' + scoresToInsert.length + ' scores)');
    } else {
      console.log('  Event: ' + ev.name + ' (' + players.length + ' players, draft)');
    }

    // Score edits on finished events 1 and 4
    if (ev.status === 'finished' && (ei === 0 || ei === 3) && players.length > 2) {
      await sbPost('score_edits', {
        event_id: eventId,
        player_id: players[1].id,
        hole_number: 5,
        old_gross: 6,
        new_gross: 5,
        reason: 'Scorer corrected — player called in with right score',
        edited_by: DEMO_ORG_ID
      });
      await sbPost('score_edits', {
        event_id: eventId,
        player_id: players[3].id,
        hole_number: 12,
        old_gross: 4,
        new_gross: 7,
        reason: 'Wrong card picked up at turn — verified with group',
        edited_by: DEMO_ORG_ID
      });
    }
  }

  console.log('\n=== Demo Seed Complete ===');
  console.log('Organiser: ' + DEMO_ORG_ID + ' (slug: ' + DEMO_SLUG + ')');
  console.log('Courses: ' + COURSES.length);
  console.log('People: ' + allPeople.length);
  console.log('Events: ' + EVENTS.length);
  console.log('Fixed scorer tokens: ' + FIXED_TOKENS.join(', '));
}

// Export for use by demo-reset function
module.exports = { seed: seed };

// Run directly when called from CLI
if (require.main === module) {
  seed().catch(function (err) {
    console.error('SEED ERROR:', err);
    process.exit(1);
  });
}
