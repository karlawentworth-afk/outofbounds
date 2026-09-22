'use strict';

var sb = require('./shared/supabase');
var engine = require('../../public/shared/engine.js');

/**
 * Verify organiser owns the event. Returns event row or null.
 */
async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&organiser_id=eq.' + organiserId +
    '&select=id,status,organiser_id,course_id,tee_id,format,handicap_allowance,max_handicap' +
    '&limit=1'
  );
  return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Determine group status:
 *   red:   gap in scorecard (e.g. hole 3 scored but hole 2 missing)
 *   amber: no scorer nominated OR no new score in 40+ minutes
 *   green: scorer nominated, scores within last 40 min, no gaps
 */
function computeStatus(group, playerIds, scoresByPlayer, now) {
  var STALE_MS = 40 * 60 * 1000;

  // Check scorer nominated
  var hasScorer = !!group.scorer_player_id;

  // Find latest updated_at across all scores for this group
  var latestUpdate = null;
  var hasAnyScores = false;

  // Check for gaps: for each player, find scored holes and detect gaps
  var hasGap = false;

  for (var i = 0; i < playerIds.length; i++) {
    var pid = playerIds[i];
    var pScores = scoresByPlayer[pid] || [];

    if (pScores.length === 0) continue;
    hasAnyScores = true;

    // Track latest update
    for (var j = 0; j < pScores.length; j++) {
      var ts = pScores[j].updated_at ? new Date(pScores[j].updated_at).getTime() : 0;
      if (ts > (latestUpdate || 0)) latestUpdate = ts;
    }

    // Check for gaps: find max hole scored, then check all holes 1..max exist
    var scoredHoles = {};
    var maxHole = 0;
    for (var j = 0; j < pScores.length; j++) {
      var hn = pScores[j].hole_number;
      scoredHoles[hn] = true;
      if (hn > maxHole) maxHole = hn;
    }
    for (var h = 1; h <= maxHole; h++) {
      if (!scoredHoles[h]) {
        hasGap = true;
        break;
      }
    }
    if (hasGap) break;
  }

  // Red: gap in scorecard
  if (hasGap) return 'red';

  // Amber: no scorer OR stale scores
  if (!hasScorer) return 'amber';
  if (hasAnyScores && latestUpdate && (now - latestUpdate) >= STALE_MS) return 'amber';
  if (!hasAnyScores) return 'amber';

  // Green: all good
  return 'green';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'GET') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var qs = event.queryStringParameters || {};
  var eventId = qs.event_id;
  var organiserId = qs.organiser_id;

  if (!eventId || !organiserId) {
    return sb.respond(400, { error: 'Missing event_id or organiser_id' });
  }

  try {
    var ev = await verifyOwnership(eventId, organiserId);
    if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

    // Fetch groups, players, scores, and holes in parallel
    var results = await Promise.all([
      sb.sbGet(
        'groups?event_id=eq.' + eventId +
        '&select=id,group_number,scorer_player_id' +
        '&order=group_number.asc'
      ),
      sb.sbGet(
        'players?event_id=eq.' + eventId +
        '&select=id,display_name,group_id,playing_handicap,pair_key'
      ),
      sb.sbGet(
        'hole_scores?event_id=eq.' + eventId +
        '&select=player_id,hole_number,gross_score,picked_up,updated_at'
      ),
      ev.tee_id
        ? sb.sbGet(
            'course_tees?id=eq.' + ev.tee_id +
            '&select=slope,rating,par_total&limit=1'
          )
        : Promise.resolve([]),
      ev.course_id
        ? sb.sbGet(
            'course_holes?course_id=eq.' + ev.course_id +
            '&select=hole_number,par,stroke_index' +
            '&order=hole_number.asc'
          )
        : Promise.resolve([])
    ]);

    var groups = results[0] || [];
    var players = results[1] || [];
    var allScores = results[2] || [];
    var teeData = (results[3] && results[3][0]) || { slope: 113, rating: 72, par_total: 72 };
    var holes = results[4] || [];

    // Index players by group
    var playersByGroup = {};
    var playerById = {};
    players.forEach(function (p) {
      playerById[p.id] = p;
      if (p.group_id) {
        if (!playersByGroup[p.group_id]) playersByGroup[p.group_id] = [];
        playersByGroup[p.group_id].push(p);
      }
    });

    // Index scores by player
    var scoresByPlayer = {};
    allScores.forEach(function (s) {
      if (!scoresByPlayer[s.player_id]) scoresByPlayer[s.player_id] = [];
      scoresByPlayer[s.player_id].push(s);
    });

    // Build engine-compatible score maps
    var scoresMap = {};
    var pickedUpMap = {};
    allScores.forEach(function (s) {
      if (!scoresMap[s.player_id]) scoresMap[s.player_id] = {};
      if (!pickedUpMap[s.player_id]) pickedUpMap[s.player_id] = {};
      scoresMap[s.player_id][s.hole_number] = s.gross_score;
      if (s.picked_up) pickedUpMap[s.player_id][s.hole_number] = true;
    });

    // Map scorer names
    var scorerNames = {};
    groups.forEach(function (g) {
      if (g.scorer_player_id && playerById[g.scorer_player_id]) {
        scorerNames[g.id] = playerById[g.scorer_player_id].display_name;
      }
    });

    // Use engine to compute standings for totals
    var standings = engine.buildStandings({
      scores: scoresMap,
      pickedUp: pickedUpMap,
      holes: holes,
      players: players,
      groups: groups,
      format: ev.format || 'individual_stableford',
      maxHole: 18
    });

    // Index standings by groupId for totals
    var totalsByGroup = {};
    var thruByGroup = {};
    standings.forEach(function (entry) {
      if (entry.groupId) {
        if (!totalsByGroup[entry.groupId]) totalsByGroup[entry.groupId] = 0;
        totalsByGroup[entry.groupId] += entry.points;
        if (!thruByGroup[entry.groupId] || entry.thru > thruByGroup[entry.groupId]) {
          thruByGroup[entry.groupId] = entry.thru;
        }
      }
    });

    var now = Date.now();
    var result = groups.map(function (g) {
      var groupPlayerIds = (playersByGroup[g.id] || []).map(function (p) { return p.id; });

      return {
        group_number: g.group_number,
        scorer_name: scorerNames[g.id] || null,
        through: thruByGroup[g.id] || 0,
        total: totalsByGroup[g.id] || 0,
        status: computeStatus(g, groupPlayerIds, scoresByPlayer, now)
      };
    });

    return sb.respond(200, { groups: result });
  } catch (err) {
    console.error('org-group-status error:', err);
    return sb.respond(500, { error: err.message });
  }
};
