'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'GET') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var qs = event.queryStringParameters || {};
  var eventId = qs.event;

  if (!eventId) {
    return sb.respond(400, { error: 'Missing required query param: event' });
  }

  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return sb.respond(400, { error: 'Invalid event id format' });
  }

  try {
    var players = await sb.sbGet(
      'players?event_id=eq.' + eventId +
      '&select=id,display_name,first_name,last_name,player_token,group_id' +
      '&order=display_name.asc'
    );

    return sb.respond(200, {
      players: (players || []).map(function (p) {
        return {
          id: p.id,
          display_name: p.display_name,
          first_name: p.first_name,
          last_name: p.last_name,
          token: p.player_token
        };
      })
    });
  } catch (err) {
    console.error('event-players error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
