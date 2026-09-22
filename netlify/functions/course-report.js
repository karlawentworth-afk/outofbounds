'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  var token = body.token;
  var reportText = (body.report || '').trim();

  if (!token) return sb.respond(400, { error: 'Missing player token' });
  if (!reportText || reportText.length < 5) return sb.respond(400, { error: 'Report must be at least 5 characters' });
  if (reportText.length > 1000) return sb.respond(400, { error: 'Report too long (max 1000 characters)' });

  try {
    // Look up the player
    var players = await sb.sbGet(
      'players?player_token=eq.' + encodeURIComponent(token) +
      '&select=id,event_id&limit=1'
    );
    if (!players || players.length === 0) return sb.respond(404, { error: 'Player not found' });
    var player = players[0];

    // Get the event's course_id
    var events = await sb.sbGet(
      'events?id=eq.' + player.event_id +
      '&select=id,course_id&limit=1'
    );
    if (!events || events.length === 0) return sb.respond(404, { error: 'Event not found' });
    var ev = events[0];

    if (!ev.course_id) return sb.respond(400, { error: 'No course linked to this event' });

    // Write the report
    await sb.sbPost('course_reports', {
      course_id: ev.course_id,
      event_id: ev.id,
      player_id: player.id,
      report_text: reportText
    });

    return sb.respond(200, { ok: true });
  } catch (err) {
    console.error('course-report error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
