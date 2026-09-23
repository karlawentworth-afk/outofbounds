'use strict';

var sb = require('./shared/supabase');

/**
 * Player confirms their identity, handicap, and optional email.
 * Called from the "That's me" screen after find-your-name.
 * Sets player_status='confirmed', handicap_source='player',
 * recalculates playing_handicap.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.token) return sb.respond(400, { error: 'Missing token' });

  try {
    // Look up player by token
    var players = await sb.sbGet(
      'players?player_token=eq.' + encodeURIComponent(body.token) +
      '&select=id,event_id,handicap_index,playing_handicap,player_status' +
      '&limit=1'
    );

    if (!players || !players.length) {
      return sb.respond(404, { error: 'Player not found' });
    }

    var player = players[0];

    // Build update
    var update = {
      player_status: 'confirmed',
      handicap_source: 'player'
    };

    // Update handicap if provided
    var newHI = body.handicap_index != null ? parseFloat(body.handicap_index) : null;
    if (newHI !== null && !isNaN(newHI)) {
      update.handicap_index = newHI;

      // Recalculate playing handicap
      // Need event tee data
      var events = await sb.sbGet(
        'events?id=eq.' + player.event_id +
        '&select=tee_id,handicap_allowance,max_handicap' +
        '&limit=1'
      );

      if (events && events.length && events[0].tee_id) {
        var tees = await sb.sbGet(
          'course_tees?id=eq.' + events[0].tee_id +
          '&select=slope,rating,par_total' +
          '&limit=1'
        );

        if (tees && tees.length) {
          var t = tees[0];
          var ev = events[0];
          var ch = Math.round(newHI * (parseFloat(t.slope) / 113));
          var adj = ch + (Math.round(parseFloat(t.rating)) - parseInt(t.par_total));
          var ph = Math.max(0, Math.min(
            parseInt(ev.max_handicap) || 54,
            Math.round(adj * parseFloat(ev.handicap_allowance))
          ));
          update.playing_handicap = ph;
        }
      }
    } else if (player.handicap_index != null) {
      // Player tapped through without changing — still confirmed
      update.handicap_index = player.handicap_index;
    }

    // Update email if provided
    if (body.email !== undefined) {
      update.email = body.email || null;
    }

    await sb.sbPatch('players?id=eq.' + player.id, update);

    return sb.respond(200, {
      ok: true,
      playing_handicap: update.playing_handicap || player.playing_handicap
    });
  } catch (err) {
    console.error('player-confirm error:', err);
    return sb.respond(500, { error: err.message });
  }
};
