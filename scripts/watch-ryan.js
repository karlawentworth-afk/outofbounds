'use strict';

/**
 * watch-ryan.js — Monitor Ryan's organiser activity on production.
 * Run: node scripts/watch-ryan.js
 * Polls every 10 minutes. Commits hourly or immediately on snags.
 */

var https = require('https');
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var ORG_ID = '7d1a0521-0720-49cf-94bf-1f3263a7cabb';
var SB_URL = 'ahutmswadskdkqhnrhhh.supabase.co';
var SK = process.env.SUPABASE_SERVICE_KEY;

if (!SK) {
  // Try loading from Netlify CLI
  try {
    SK = execSync('netlify env:get SUPABASE_SERVICE_KEY --context production', { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error('Cannot load SUPABASE_SERVICE_KEY. Set it or run inside Netlify CLI context.');
    process.exit(1);
  }
}

var REPORT = path.join(__dirname, '..', 'docs', 'console-outbox', 'ryan-watch.md');
var STATE_FILE = path.join(__dirname, '..', '.claude', 'ryan-watch-state.json');
var POLL_MS = 10 * 60 * 1000; // 10 minutes
var COMMIT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

var lastCommit = Date.now();
var pendingSnag = false;

// --- Supabase REST helper ---

function sbGet(table) {
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: SB_URL,
      path: '/rest/v1/' + table,
      method: 'GET',
      headers: {
        'apikey': SK,
        'Authorization': 'Bearer ' + SK,
        'Accept': 'application/json'
      }
    };
    var req = https.request(opts, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Parse error: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(9000, function () { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// --- State ---

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { lastSeen: new Date('2026-11-17T00:00:00Z').toISOString(), reportedSnags: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Report ---

function appendReport(line) {
  var ts = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false });
  var entry = '[' + ts + '] ' + line + '\n';
  fs.appendFileSync(REPORT, entry);
  console.log(entry.trim());
}

function prependSnag(line) {
  var ts = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false });
  var entry = 'SNAG [' + ts + '] ' + line + '\n';
  var existing = '';
  try { existing = fs.readFileSync(REPORT, 'utf8'); } catch (e) { /* new file */ }

  // Insert after the header line
  var lines = existing.split('\n');
  var headerEnd = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#') || lines[i].trim() === '') { headerEnd = i + 1; }
    else { break; }
  }
  lines.splice(headerEnd, 0, entry.trim());
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log('SNAG: ' + entry.trim());
  pendingSnag = true;
}

function commitAndPush(msg) {
  try {
    execSync('git add "' + REPORT + '"', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    execSync('git commit -m "' + msg + ' [skip netlify]"', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    execSync('git push', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    console.log('Committed and pushed: ' + msg);
    lastCommit = Date.now();
    pendingSnag = false;
  } catch (e) {
    console.error('Git error:', e.message);
  }
}

// --- Checks ---

async function checkActivity(state) {
  var since = encodeURIComponent(state.lastSeen);
  var logs = await sbGet(
    'activity_log?organiser_id=eq.' + ORG_ID +
    '&created_at=gt.' + since +
    '&select=action,detail,created_at&order=created_at.asc'
  );

  if (!Array.isArray(logs)) return state;

  var newLast = state.lastSeen;
  for (var i = 0; i < logs.length; i++) {
    var l = logs[i];
    var desc = l.action + (l.detail ? ': ' + l.detail : '');
    appendReport('Activity — ' + desc);
    if (l.created_at > newLast) newLast = l.created_at;
  }
  state.lastSeen = newLast;
  return state;
}

async function checkSnags(state) {
  if (!state.reportedSnags) state.reportedSnags = {};

  // Get Ryan's events
  var events = await sbGet(
    'events?organiser_id=eq.' + ORG_ID + '&select=id,name,status,created_at,paid_at'
  );
  if (!Array.isArray(events)) return;

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.status !== 'live') continue;

    var eventId = ev.id;

    // Check: live for more than 2 hours with no scores
    var liveAt = new Date(ev.paid_at || ev.created_at);
    var hoursLive = (Date.now() - liveAt.getTime()) / (1000 * 60 * 60);

    var scores = await sbGet(
      'hole_scores?event_id=eq.' + eventId + '&select=id&limit=1'
    );
    var snagKey1 = eventId + ':no_scores';
    if (hoursLive > 2 && Array.isArray(scores) && scores.length === 0 && !state.reportedSnags[snagKey1]) {
      prependSnag('Event "' + ev.name + '" live for ' + Math.round(hoursLive) + 'h with no scores');
      state.reportedSnags[snagKey1] = true;
    } else if (Array.isArray(scores) && scores.length > 0) {
      delete state.reportedSnags[snagKey1]; // Clear if resolved
    }

    // Check: players with no group
    var players = await sbGet(
      'players?event_id=eq.' + eventId + '&group_id=is.null&select=id'
    );
    var ungroupedCount = Array.isArray(players) ? players.length : 0;
    var snagKey2 = eventId + ':no_group';
    if (ungroupedCount > 0 && !state.reportedSnags[snagKey2]) {
      prependSnag('Event "' + ev.name + '" has ' + ungroupedCount + ' player(s) with no group');
      state.reportedSnags[snagKey2] = true;
    } else if (ungroupedCount === 0) {
      delete state.reportedSnags[snagKey2];
    }

    // Check: groups with no tee time
    var groups = await sbGet(
      'groups?event_id=eq.' + eventId + '&tee_time=is.null&select=id&limit=1'
    );
    var snagKey3 = eventId + ':no_tee_time';
    if (Array.isArray(groups) && groups.length > 0 && !state.reportedSnags[snagKey3]) {
      prependSnag('Event "' + ev.name + '" has group(s) with no tee time');
      state.reportedSnags[snagKey3] = true;
    } else if (Array.isArray(groups) && groups.length === 0) {
      delete state.reportedSnags[snagKey3];
    }
  }
}

// --- Main loop ---

async function poll() {
  var state = loadState();

  try {
    state = await checkActivity(state);
    await checkSnags(state);
    saveState(state);
  } catch (e) {
    appendReport('Watcher error: ' + e.message);
  }

  // Commit immediately on snag, or hourly
  if (pendingSnag) {
    commitAndPush('Ryan watcher: SNAG detected');
  } else if (Date.now() - lastCommit > COMMIT_INTERVAL_MS) {
    commitAndPush('Ryan watcher: hourly log');
  }
}

// Init report if missing
if (!fs.existsSync(REPORT)) {
  fs.writeFileSync(REPORT, '# Ryan watch log\n\n');
}

console.log('Ryan watcher started. Polling every 10 minutes.');
console.log('Organiser ID: ' + ORG_ID);
console.log('Report: ' + REPORT);

// Run immediately, then every 10 minutes
poll();
setInterval(poll, POLL_MS);
