'use strict';

var sb = require('./shared/supabase');

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

        // Get all players without groups (or all players for reassignment)
        var players = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&select=id,display_name' +
          '&order=created_at.asc'
        );

        if (!players || players.length === 0) {
          return sb.respond(400, { error: 'No players to group' });
        }

        // Determine group size based on format
        var groupSize = 4; // default
        if (ev.format === 'better_ball_pairs') groupSize = 4; // 2 pairs of 2
        // For 2from4, 4 per group

        var numGroups = Math.ceil(players.length / groupSize);

        // Delete existing groups first
        var existingGroups = await sb.sbGet(
          'groups?event_id=eq.' + body.event_id + '&select=id'
        );
        if (existingGroups && existingGroups.length > 0) {
          // Clear player group assignments first
          for (var i = 0; i < players.length; i++) {
            await sb.sbPatch('players?id=eq.' + players[i].id, { group_id: null, pair_key: null });
          }
          // Delete groups
          var https = require('https');
          var key = process.env.SUPABASE_SERVICE_KEY;
          for (var i = 0; i < existingGroups.length; i++) {
            await new Promise(function (resolve, reject) {
              var opts = {
                hostname: 'ahutmswadskdkqhnrhhh.supabase.co',
                port: 443,
                path: '/rest/v1/groups?id=eq.' + existingGroups[i].id,
                method: 'DELETE',
                headers: {
                  'apikey': key,
                  'Authorization': 'Bearer ' + key,
                  'Content-Type': 'application/json'
                }
              };
              var timer = setTimeout(function () { reject(new Error('Timeout')); }, 9000);
              var req = https.request(opts, function (res) {
                var chunks = [];
                res.on('data', function (c) { chunks.push(c); });
                res.on('end', function () { clearTimeout(timer); resolve(); });
              });
              req.on('error', function (err) { clearTimeout(timer); reject(err); });
              req.end();
            });
          }
        }

        // Create new groups
        var newGroups = [];
        for (var g = 0; g < numGroups; g++) {
          newGroups.push({
            event_id: body.event_id,
            group_number: g + 1,
            starting_hole: 1
          });
        }

        var createdGroups = await sb.sbPost('groups', newGroups);
        if (!Array.isArray(createdGroups)) createdGroups = [createdGroups];

        // Assign players to groups
        for (var i = 0; i < players.length; i++) {
          var groupIdx = Math.floor(i / groupSize);
          if (groupIdx >= createdGroups.length) groupIdx = createdGroups.length - 1;

          var patchData = { group_id: createdGroups[groupIdx].id };

          // Assign pair keys for BB pairs
          if (ev.format === 'better_ball_pairs') {
            var posInGroup = i % groupSize;
            patchData.pair_key = posInGroup < 2 ? 'A' : 'B';
          }

          await sb.sbPatch('players?id=eq.' + players[i].id, patchData);
        }

        return sb.respond(200, { ok: true, groups_created: createdGroups.length });
      } catch (err) {
        console.error('org-groups auto_fill error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'assign') {
      // Assign a player to a group
      if (!body.event_id || !body.organiser_id || !body.player_id || !body.group_id) {
        return sb.respond(400, { error: 'Missing required fields' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        var patchData = { group_id: body.group_id };
        if (body.pair_key) patchData.pair_key = body.pair_key;

        await sb.sbPatch('players?id=eq.' + body.player_id, patchData);

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

      var updated = await sb.sbPatch('groups?id=eq.' + body.id, update);

      return sb.respond(200, { group: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('org-groups PATCH error:', err);
      return sb.respond(500, { error: err.message });
    }
  }
};
