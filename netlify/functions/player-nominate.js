'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON body' });
  }

  var token = body.token;
  var scorerPlayerId = body.scorer_player_id;

  if (!token || typeof token !== 'string') {
    return sb.respond(400, { error: 'Missing or invalid token' });
  }
  if (!scorerPlayerId || typeof scorerPlayerId !== 'string') {
    return sb.respond(400, { error: 'Missing or invalid scorer_player_id' });
  }

  try {
    // 1. Look up the player by token
    var players = await sb.sbGet(
      'players?player_token=eq.' + encodeURIComponent(token) +
      '&select=id,group_id,event_id' +
      '&limit=1'
    );

    if (!players || players.length === 0) {
      return sb.respond(404, { error: 'Player not found' });
    }

    var player = players[0];
    var groupId = player.group_id;

    if (!groupId) {
      return sb.respond(400, { error: 'Player is not in a group' });
    }

    // 2. Verify the nominated scorer is in the same group
    var groupPlayers = await sb.sbGet(
      'players?group_id=eq.' + groupId +
      '&select=id'
    );

    var validIds = {};
    (groupPlayers || []).forEach(function (p) { validIds[p.id] = true; });

    if (!validIds[scorerPlayerId]) {
      return sb.respond(403, { error: 'Nominated scorer is not in your group' });
    }

    // 3. Update the group's scorer_player_id
    await sb.sbPatch(
      'groups?id=eq.' + groupId,
      { scorer_player_id: scorerPlayerId }
    );

    return sb.respond(200, { ok: true });
  } catch (err) {
    console.error('player-nominate error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
