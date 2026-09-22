'use strict';

var sb = require('./shared/supabase');
var engine = require('../../public/shared/engine');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'GET') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var qs = event.queryStringParameters || {};
  var eventId = qs.event;
  var mode = qs.mode || 'player';

  if (!eventId) {
    return sb.respond(400, { error: 'Missing required query param: event' });
  }

  // Validate UUID-ish format
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return sb.respond(400, { error: 'Invalid event id format' });
  }

  if (['player', 'board', 'organiser'].indexOf(mode) === -1) {
    return sb.respond(400, { error: 'mode must be player, board, or organiser' });
  }

  try {
    // Fetch event, players, groups, holes, scores in parallel
    var promises = [
      sb.sbGet(
        'events?id=eq.' + eventId +
        '&select=id,format,handicap_allowance,leaderboard_freeze_hole,board_show_full,' +
        'secondary_format,secondary_title,secondary_allowance,course_id,tee_id,status' +
        '&limit=1'
      ),
      sb.sbGet(
        'players?event_id=eq.' + eventId +
        '&select=id,display_name,playing_handicap,group_id,pair_key'
      ),
      sb.sbGet(
        'groups?event_id=eq.' + eventId +
        '&select=id,group_number,tee_time,starting_hole'
      ),
      sb.sbGet(
        'hole_scores?event_id=eq.' + eventId +
        '&select=player_id,hole_number,gross_score,picked_up'
      )
    ];

    var results = await Promise.all(promises);

    var eventRow = results[0] && results[0][0];
    if (!eventRow) {
      return sb.respond(404, { error: 'Event not found' });
    }

    var allPlayers = results[1] || [];
    var allGroups = results[2] || [];
    var allScores = results[3] || [];

    // Fetch course holes (needs course_id from event)
    var holes = [];
    if (eventRow.course_id) {
      holes = await sb.sbGet(
        'course_holes?course_id=eq.' + eventRow.course_id +
        '&select=hole_number,par,stroke_index' +
        '&order=hole_number.asc'
      );
    }

    // Determine freeze hole
    var freezeHole = eventRow.leaderboard_freeze_hole || 12;
    var showFull = eventRow.board_show_full || false;

    // Organiser mode: never frozen
    // Player/board mode: frozen unless board_show_full
    var maxHole;
    if (mode === 'organiser') {
      maxHole = 18;
    } else {
      maxHole = showFull ? 18 : freezeHole;
    }

    // Build score maps
    var scoreMap = {};   // { playerId: { holeNumber: grossScore } }
    var pickedUpMap = {}; // { playerId: { holeNumber: true } }

    allScores.forEach(function (s) {
      // For non-organiser modes with freeze, skip scores beyond maxHole
      if (mode !== 'organiser' && !showFull && s.hole_number > maxHole) {
        return;
      }
      if (!scoreMap[s.player_id]) scoreMap[s.player_id] = {};
      if (!pickedUpMap[s.player_id]) pickedUpMap[s.player_id] = {};

      if (s.picked_up) {
        pickedUpMap[s.player_id][s.hole_number] = true;
      } else if (s.gross_score != null) {
        scoreMap[s.player_id][s.hole_number] = s.gross_score;
      }
    });

    // Primary standings
    var primaryEntries = engine.buildStandings({
      scores: scoreMap,
      pickedUp: pickedUpMap,
      holes: holes,
      players: allPlayers,
      groups: allGroups,
      format: eventRow.format,
      maxHole: maxHole
    });

    var response = {
      entries: primaryEntries,
      format: eventRow.format,
      allowancePct: eventRow.handicap_allowance != null
        ? Math.round(eventRow.handicap_allowance * 100)
        : 95,
      freezeHole: maxHole,
      secondary: null
    };

    // Secondary format standings
    if (eventRow.secondary_format) {
      var secondaryEntries = engine.buildStandings({
        scores: scoreMap,
        pickedUp: pickedUpMap,
        holes: holes,
        players: allPlayers,
        groups: allGroups,
        format: eventRow.secondary_format,
        maxHole: maxHole
      });

      response.secondary = {
        entries: secondaryEntries,
        title: eventRow.secondary_title || 'Secondary Competition',
        format: eventRow.secondary_format,
        allowancePct: eventRow.secondary_allowance != null
          ? Math.round(eventRow.secondary_allowance * 100)
          : response.allowancePct
      };
    }

    return sb.respond(200, response);
  } catch (err) {
    console.error('leaderboard error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
