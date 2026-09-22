'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  // Parse body
  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON body' });
  }

  var token = body.token;
  var scores = body.scores;

  // Validate inputs
  if (!token || typeof token !== 'string') {
    return sb.respond(400, { error: 'Missing or invalid token' });
  }
  if (!Array.isArray(scores) || scores.length === 0) {
    return sb.respond(400, { error: 'scores must be a non-empty array' });
  }
  if (scores.length > 72) {
    return sb.respond(400, { error: 'Too many scores in one request (max 72)' });
  }

  // Validate each score entry
  for (var i = 0; i < scores.length; i++) {
    var s = scores[i];
    if (!s.player_id || typeof s.player_id !== 'string') {
      return sb.respond(400, { error: 'scores[' + i + '].player_id is required' });
    }
    if (typeof s.hole_number !== 'number' || s.hole_number < 1 || s.hole_number > 18) {
      return sb.respond(400, { error: 'scores[' + i + '].hole_number must be 1-18' });
    }
    if (s.picked_up) {
      // picked_up is fine without gross_score
    } else {
      if (typeof s.gross_score !== 'number' || s.gross_score < 1 || s.gross_score > 20) {
        return sb.respond(400, { error: 'scores[' + i + '].gross_score must be 1-20 (or set picked_up)' });
      }
    }
  }

  try {
    // 1. Look up the scorer by token
    var players = await sb.sbGet(
      'players?player_token=eq.' + encodeURIComponent(token) +
      '&select=id,event_id,group_id' +
      '&limit=1'
    );

    if (!players || players.length === 0) {
      return sb.respond(404, { error: 'Player not found' });
    }

    var scorer = players[0];
    var eventId = scorer.event_id;
    var groupId = scorer.group_id;

    // 2. Verify the player is the group's designated scorer, and the event is live + not locked
    var promises = [
      groupId
        ? sb.sbGet(
            'groups?id=eq.' + groupId +
            '&select=id,scorer_player_id' +
            '&limit=1'
          )
        : Promise.resolve([]),
      sb.sbGet(
        'events?id=eq.' + eventId +
        '&select=id,status,locked_at' +
        '&limit=1'
      ),
      // Also get all players in the group to validate player_ids in scores
      groupId
        ? sb.sbGet(
            'players?group_id=eq.' + groupId +
            '&select=id'
          )
        : Promise.resolve([])
    ];

    var results = await Promise.all(promises);

    var groupRow = results[0] && results[0][0];
    var eventRow = results[1] && results[1][0];
    var groupPlayers = results[2] || [];

    if (!eventRow) {
      return sb.respond(404, { error: 'Event not found' });
    }

    if (eventRow.status !== 'live') {
      return sb.respond(403, { error: 'Event is not live (status: ' + eventRow.status + ')' });
    }

    if (eventRow.locked_at) {
      return sb.respond(403, { error: 'Event is locked. No more scores can be submitted.' });
    }

    if (!groupRow) {
      return sb.respond(403, { error: 'Player is not in a group' });
    }

    if (groupRow.scorer_player_id !== scorer.id) {
      return sb.respond(403, { error: 'Only the designated scorer can submit scores' });
    }

    // Validate that all player_ids in scores belong to this group
    var validPlayerIds = {};
    groupPlayers.forEach(function (p) { validPlayerIds[p.id] = true; });

    for (var i = 0; i < scores.length; i++) {
      if (!validPlayerIds[scores[i].player_id]) {
        return sb.respond(403, {
          error: 'Player ' + scores[i].player_id + ' is not in your group'
        });
      }
    }

    // 3. Upsert scores
    var rows = scores.map(function (s) {
      var row = {
        event_id: eventId,
        player_id: s.player_id,
        hole_number: s.hole_number,
        gross_score: s.picked_up ? null : s.gross_score,
        picked_up: !!s.picked_up,
        recorded_by_player_id: scorer.id,
        updated_at: new Date().toISOString()
      };
      return row;
    });

    // POST with on_conflict for upsert
    var saved = await sb.sbPost(
      'hole_scores?on_conflict=event_id,player_id,hole_number',
      rows
    );

    return sb.respond(200, {
      ok: true,
      saved: Array.isArray(saved) ? saved.length : scores.length
    });
  } catch (err) {
    console.error('score-save error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
