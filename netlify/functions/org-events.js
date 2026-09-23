'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

function makeSlug(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) + '-' + Date.now().toString(36);
}

/**
 * Verify organiser owns the event. Returns event row or null.
 */
async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&organiser_id=eq.' + organiserId +
    '&select=id,status,organiser_id,course_id,tee_id,format' +
    '&limit=1'
  );
  return (rows && rows.length > 0) ? rows[0] : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }

  var qs = event.queryStringParameters || {};

  // GET: list events for organiser
  if (event.httpMethod === 'GET') {
    var organiserId = qs.organiser_id;
    if (!organiserId) {
      return sb.respond(400, { error: 'Missing organiser_id' });
    }
    try {
      var events = await sb.sbGet(
        'events?organiser_id=eq.' + organiserId +
        '&select=id,name,slug,event_date,format,status,starting_mode,paid,created_at,archived' +
        '&order=created_at.desc'
      );
      return sb.respond(200, { events: events || [] });
    } catch (err) {
      console.error('org-events GET error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  // POST / PATCH / DELETE
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  // POST actions
  if (event.httpMethod === 'POST') {
    var action = body.action;

    if (action === 'go_live') {
      // Generate player tokens. Pro organisers also go live+paid directly.
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Generate tokens for players who don't have one
        var players = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&select=id,player_token'
        );

        var toUpdate = (players || []).filter(function (p) {
          return !p.player_token;
        });

        for (var i = 0; i < toUpdate.length; i++) {
          await sb.sbPatch(
            'players?id=eq.' + toUpdate[i].id,
            { player_token: genToken() }
          );
        }

        // Pro organisers go live without payment
        var planGate = require('./shared/plan-gate');
        var orgIsPro = await planGate.isPro(body.organiser_id);
        if (orgIsPro && ev.status === 'draft') {
          await sb.sbPatch('events?id=eq.' + body.event_id, {
            status: 'live',
            paid: true,
            paid_at: new Date().toISOString()
          });
          return sb.respond(200, { ok: true, tokens_generated: toUpdate.length, free: true });
        }

        return sb.respond(200, { ok: true, tokens_generated: toUpdate.length });
      } catch (err) {
        console.error('org-events go_live error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'finish') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // count_to_hole: 1-18, or null for all 18
        var countedHoles = body.counted_holes ? parseInt(body.counted_holes) : 18;
        if (countedHoles < 1 || countedHoles > 18 || isNaN(countedHoles)) countedHoles = 18;

        await sb.sbPatch(
          'events?id=eq.' + body.event_id,
          {
            status: 'finished',
            locked_at: new Date().toISOString(),
            results_published: true,
            results_published_at: new Date().toISOString(),
            counted_holes: countedHoles
          }
        );

        return sb.respond(200, { ok: true, counted_holes: countedHoles });
      } catch (err) {
        console.error('org-events finish error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'abandon') {
      // Abandon: mark as finished with no results
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        await sb.sbPatch(
          'events?id=eq.' + body.event_id,
          {
            status: 'finished',
            locked_at: new Date().toISOString(),
            results_published: false,
            counted_holes: 0
          }
        );

        return sb.respond(200, { ok: true, abandoned: true });
      } catch (err) {
        console.error('org-events abandon error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'archive' || action === 'unarchive') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        await sb.sbPatch('events?id=eq.' + body.event_id, {
          archived: action === 'archive'
        });

        return sb.respond(200, { ok: true, archived: action === 'archive' });
      } catch (err) {
        console.error('org-events archive error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'clone') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Get original event full data
        var origEvents = await sb.sbGet(
          'events?id=eq.' + body.event_id +
          '&select=organiser_id,name,course_id,tee_id,format,handicap_allowance,max_handicap,starting_mode,leaderboard_freeze_hole&limit=1'
        );
        if (!origEvents || !origEvents.length) {
          return sb.respond(404, { error: 'Event not found' });
        }
        var orig = origEvents[0];

        var newEvent = {
          organiser_id: orig.organiser_id,
          slug: makeSlug(orig.name),
          name: orig.name + ' (copy)',
          event_date: null,
          course_id: orig.course_id,
          tee_id: orig.tee_id,
          format: orig.format,
          handicap_allowance: orig.handicap_allowance,
          max_handicap: orig.max_handicap,
          starting_mode: orig.starting_mode,
          leaderboard_freeze_hole: orig.leaderboard_freeze_hole,
          status: 'draft'
        };

        var created = await sb.sbPost('events', newEvent);
        var cloned = Array.isArray(created) ? created[0] : created;

        // Clone players (without tokens or group assignments)
        var origPlayers = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&select=first_name,last_name,display_name,handicap_index'
        );

        var playersCopied = 0;
        if (origPlayers && origPlayers.length > 0) {
          var newPlayers = origPlayers.map(function (p) {
            return {
              event_id: cloned.id,
              first_name: p.first_name,
              last_name: p.last_name,
              display_name: p.display_name,
              handicap_index: p.handicap_index,
              player_token: genToken()
            };
          });
          await sb.sbPost('players', newPlayers);
          playersCopied = newPlayers.length;
        }

        return sb.respond(200, { event_id: cloned.id, players_copied: playersCopied });
      } catch (err) {
        console.error('org-events clone error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else {
      // Create new event (no action field)
      if (!body.organiser_id) {
        return sb.respond(400, { error: 'Missing organiser_id' });
      }
      if (!body.name || !body.name.trim()) {
        return sb.respond(400, { error: 'Missing event name' });
      }

      try {
        var row = {
          organiser_id: body.organiser_id,
          slug: makeSlug(body.name),
          name: body.name.trim(),
          event_date: body.event_date || null,
          format: body.format || 'individual_stableford',
          handicap_allowance: body.handicap_allowance != null ? body.handicap_allowance : 0.95,
          max_handicap: body.max_handicap != null ? body.max_handicap : 54,
          starting_mode: body.starting_mode || 'tee_times',
          leaderboard_freeze_hole: body.leaderboard_freeze_hole != null ? body.leaderboard_freeze_hole : 12,
          status: 'draft'
        };

        if (body.course_id) row.course_id = body.course_id;
        if (body.tee_id) row.tee_id = body.tee_id;

        var created = await sb.sbPost('events', row);
        var ev = Array.isArray(created) ? created[0] : created;

        return sb.respond(200, { event: ev });
      } catch (err) {
        console.error('org-events create error:', err);
        return sb.respond(500, { error: err.message });
      }
    }
  }

  // PATCH: update event
  if (event.httpMethod === 'PATCH') {
    if (!body.id || !body.organiser_id) {
      return sb.respond(400, { error: 'Missing id or organiser_id' });
    }

    try {
      var ev = await verifyOwnership(body.id, body.organiser_id);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      // Build update payload — only allowed fields
      var allowed = [
        'name', 'event_date', 'format', 'handicap_allowance', 'max_handicap',
        'starting_mode', 'leaderboard_freeze_hole', 'course_id', 'tee_id',
        'sponsor_name', 'sponsor_logo_url', 'headline_text',
        'board_rows_per_page', 'board_show_full'
      ];
      var update = {};
      allowed.forEach(function (k) {
        if (body[k] !== undefined) update[k] = body[k];
      });

      if (Object.keys(update).length === 0) {
        return sb.respond(400, { error: 'No valid fields to update' });
      }

      var updated = await sb.sbPatch(
        'events?id=eq.' + body.id,
        update
      );

      return sb.respond(200, { event: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('org-events PATCH error:', err);
      return sb.respond(500, { error: err.message });
    }
  }
};
