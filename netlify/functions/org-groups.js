'use strict';

var sb = require('./shared/supabase');
var audit = require('./shared/audit');

/**
 * Verify organiser owns the event.
 */
async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&organiser_id=eq.' + organiserId +
    '&select=id,organiser_id,format,starting_mode' +
    '&limit=1'
  );
  return (rows && rows.length > 0) ? rows[0] : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }

  var qs = event.queryStringParameters || {};

  // GET: list groups with members
  if (event.httpMethod === 'GET') {
    var eventId = qs.event_id;
    var organiserId = qs.organiser_id;
    if (!eventId || !organiserId) {
      return sb.respond(400, { error: 'Missing event_id or organiser_id' });
    }
    try {
      var ev = await verifyOwnership(eventId, organiserId);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      var groups = await sb.sbGet(
        'groups?event_id=eq.' + eventId +
        '&select=id,group_number,tee_time,starting_hole,scorer_player_id' +
        '&order=group_number.asc'
      );

      var players = await sb.sbGet(
        'players?event_id=eq.' + eventId +
        '&select=id,display_name,group_id,pair_key,handicap_index,playing_handicap' +
        '&order=created_at.asc'
      );

      return sb.respond(200, {
        groups: groups || [],
        players: players || []
      });
    } catch (err) {
      console.error('org-groups GET error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  // POST: auto_fill or save groups
  if (event.httpMethod === 'POST') {
    var action = body.action;

    if (action === 'auto_fill') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Get only unassigned players (autofill never reshuffles existing groups)
        var players = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&group_id=is.null' +
          '&select=id,display_name' +
          '&order=created_at.asc'
        );

        if (!players || players.length === 0) {
          return sb.respond(200, { ok: true, groups_created: 0, message: 'No unassigned players' });
        }

        // Determine group size based on format
        var groupSize = 4;

        // Find the highest existing group_number to continue from
        var existingGroups = await sb.sbGet(
          'groups?event_id=eq.' + body.event_id +
          '&select=group_number&order=group_number.desc&limit=1'
        );
        var startNum = (existingGroups && existingGroups[0]) ? existingGroups[0].group_number + 1 : 1;

        var numGroups = Math.ceil(players.length / groupSize);

        // Create all new groups in one batch POST
        var newGroups = [];
        for (var g = 0; g < numGroups; g++) {
          newGroups.push({
            event_id: body.event_id,
            group_number: startNum + g,
            starting_hole: 1
          });
        }

        var createdGroups = await sb.sbPost('groups', newGroups);
        if (!Array.isArray(createdGroups)) createdGroups = [createdGroups];

        // Assign all players in parallel batches of 10
        // Each batch is a Promise.all of up to 10 PATCH calls
        var batchSize = 10;
        for (var bi = 0; bi < players.length; bi += batchSize) {
          var batch = [];
          for (var j = bi; j < Math.min(bi + batchSize, players.length); j++) {
            var groupIdx = Math.floor(j / groupSize);
            if (groupIdx >= createdGroups.length) groupIdx = createdGroups.length - 1;

            var patchData = { group_id: createdGroups[groupIdx].id };
            if (ev.format === 'better_ball_pairs') {
              patchData.pair_key = (j % groupSize) < 2 ? 'A' : 'B';
            }

            batch.push(sb.sbPatch('players?id=eq.' + players[j].id, patchData));
          }
          await Promise.all(batch);
        }

        return sb.respond(200, { ok: true, groups_created: createdGroups.length });
      } catch (err) {
        console.error('org-groups auto_fill error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'assign') {
      // Assign a player to a group (or null to unassign)
      if (!body.event_id || !body.organiser_id || !body.player_id) {
        return sb.respond(400, { error: 'Missing required fields' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        var patchData = { group_id: body.group_id };
        if (body.pair_key) patchData.pair_key = body.pair_key;

        await sb.sbPatch('players?id=eq.' + body.player_id, patchData);

        await audit.log(body.event_id, 'player_moved', {
          player_id: body.player_id,
          to_group: body.group_id
        }, body.organiser_id);

        return sb.respond(200, { ok: true });
      } catch (err) {
        console.error('org-groups assign error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'create_group') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Get current max group number
        var existing = await sb.sbGet(
          'groups?event_id=eq.' + body.event_id +
          '&select=group_number&order=group_number.desc&limit=1'
        );
        var nextNum = (existing && existing.length > 0) ? existing[0].group_number + 1 : 1;

        var newGroup = await sb.sbPost('groups', {
          event_id: body.event_id,
          group_number: nextNum,
          starting_hole: body.starting_hole || 1
        });

        return sb.respond(200, { group: Array.isArray(newGroup) ? newGroup[0] : newGroup });
      } catch (err) {
        console.error('org-groups create error:', err);
        return sb.respond(500, { error: err.message });
      }
    } else {
      return sb.respond(400, { error: 'Unknown action' });
    }
  }

  // PATCH: update group
  if (event.httpMethod === 'PATCH') {
    if (!body.id || !body.event_id || !body.organiser_id) {
      return sb.respond(400, { error: 'Missing id, event_id, or organiser_id' });
    }
    try {
      var ev = await verifyOwnership(body.event_id, body.organiser_id);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      var update = {};
      if (body.tee_time !== undefined) update.tee_time = body.tee_time;
      if (body.starting_hole !== undefined) update.starting_hole = body.starting_hole;
      if (body.group_number !== undefined) update.group_number = body.group_number;

      var updated = await sb.sbPatch('groups?id=eq.' + body.id, update);

      // Audit tee_time and starting_hole changes
      if (body.tee_time !== undefined) {
        await audit.log(body.event_id, 'tee_time_changed', { group_id: body.id, tee_time: body.tee_time }, body.organiser_id);
      }
      if (body.starting_hole !== undefined) {
        await audit.log(body.event_id, 'starting_hole_changed', { group_id: body.id, starting_hole: body.starting_hole }, body.organiser_id);
      }

      return sb.respond(200, { group: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('org-groups PATCH error:', err);
      return sb.respond(500, { error: err.message });
    }
  }
};
