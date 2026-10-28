'use strict';

var sb = require('./shared/supabase');
var audit = require('./shared/audit');
var auth = require('./_auth');

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

/**
 * Renumber groups 1..N by current order for an event.
 * Uses parallel PATCHes — only touches groups whose number is wrong.
 */
async function renumberGroups(eventId) {
  var groups = await sb.sbGet(
    'groups?event_id=eq.' + eventId +
    '&select=id,group_number' +
    '&order=group_number.asc,id.asc'
  );
  if (!groups || !groups.length) return;

  var patches = [];
  for (var i = 0; i < groups.length; i++) {
    var expected = i + 1;
    if (groups[i].group_number !== expected) {
      patches.push(sb.sbPatch('groups?id=eq.' + groups[i].id, { group_number: expected }));
    }
  }
  if (patches.length > 0) await Promise.all(patches);
}

/**
 * Delete empty groups (no players assigned) for an event.
 * One read to find occupied groups, one delete for the rest.
 */
async function deleteEmptyGroups(eventId) {
  var groups = await sb.sbGet(
    'groups?event_id=eq.' + eventId + '&select=id'
  );
  if (!groups || !groups.length) return 0;

  var players = await sb.sbGet(
    'players?event_id=eq.' + eventId + '&group_id=not.is.null&select=group_id'
  );
  var occupied = {};
  (players || []).forEach(function (p) { occupied[p.group_id] = true; });

  var emptyIds = groups.filter(function (g) { return !occupied[g.id]; }).map(function (g) { return g.id; });
  if (emptyIds.length === 0) return 0;

  await sb.sbDelete('groups?id=in.(' + emptyIds.join(',') + ')');
  return emptyIds.length;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }

  // Auth: require event ownership
  var qs = event.queryStringParameters || {};
  var peekBody;
  try { peekBody = JSON.parse(event.body || '{}'); } catch (e) { peekBody = {}; }
  var authEventId = qs.event_id || peekBody.event_id;
  if (authEventId) {
    try { await auth.requireEventOwner(event, authEventId); }
    catch (err) { return auth.authError(err); }
  } else {
    var authOrgId = qs.organiser_id || peekBody.organiser_id;
    if (authOrgId) {
      try { await auth.requireOrgMember(event, authOrgId); }
      catch (err) { return auth.authError(err); }
    } else {
      try { await auth.requireUser(event); }
      catch (err) { return auth.authError(err); }
    }
  }

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
        '&select=id,display_name,group_id,pair_key,handicap_index,playing_handicap,player_status,first_name,last_name,email' +
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

  // POST: auto_fill, assign, create_group
  if (event.httpMethod === 'POST') {
    var action = body.action;

    if (action === 'auto_fill') {
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Get unassigned players
        var players = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&group_id=is.null' +
          '&select=id,display_name' +
          '&order=created_at.asc'
        );

        if (!players || players.length === 0) {
          return sb.respond(200, { ok: true, groups_created: 0, groups_filled: 0, unassigned: 0, message: 'Nothing to fill — all players are in groups' });
        }

        var groupSize = 4;

        // Find existing empty groups first
        var allGroups = await sb.sbGet(
          'groups?event_id=eq.' + body.event_id +
          '&select=id,group_number' +
          '&order=group_number.asc'
        );
        var allPlayers = await sb.sbGet(
          'players?event_id=eq.' + body.event_id +
          '&select=id,group_id'
        );

        // Count members per group
        var memberCount = {};
        (allPlayers || []).forEach(function (p) {
          if (p.group_id) memberCount[p.group_id] = (memberCount[p.group_id] || 0) + 1;
        });

        // Find groups with space (fewer than groupSize members)
        var groupsWithSpace = (allGroups || []).filter(function (g) {
          return (memberCount[g.id] || 0) < groupSize;
        });

        // Calculate how many additional groups we need
        var slotsAvailable = 0;
        groupsWithSpace.forEach(function (g) {
          slotsAvailable += groupSize - (memberCount[g.id] || 0);
        });

        var slotsNeeded = Math.max(0, players.length - slotsAvailable);
        var newGroupsNeeded = Math.ceil(slotsNeeded / groupSize);

        // Find highest group number for new groups
        var maxNum = 0;
        (allGroups || []).forEach(function (g) {
          if (g.group_number > maxNum) maxNum = g.group_number;
        });

        // Create new groups if needed
        var createdGroups = [];
        if (newGroupsNeeded > 0) {
          var newGroups = [];
          for (var g = 0; g < newGroupsNeeded; g++) {
            newGroups.push({
              event_id: body.event_id,
              group_number: maxNum + 1 + g,
              starting_hole: 1
            });
          }
          createdGroups = await sb.sbPost('groups', newGroups);
          if (!Array.isArray(createdGroups)) createdGroups = [createdGroups];
        }

        // Build ordered list of groups to fill: existing with space first, then new
        var fillOrder = groupsWithSpace.concat(createdGroups);
        var freshGroups = newGroupsNeeded > 0;

        // Compute all assignments in memory
        var assignments = [];
        var playerIdx = 0;
        var groupsFilled = 0;

        for (var gi = 0; gi < fillOrder.length && playerIdx < players.length; gi++) {
          var group = fillOrder[gi];
          var currentMembers = memberCount[group.id] || 0;
          var slotsInGroup = groupSize - currentMembers;
          var filled = false;

          for (var si = 0; si < slotsInGroup && playerIdx < players.length; si++) {
            var assign = { id: players[playerIdx].id, group_id: group.id };
            if (ev.format === 'better_ball_pairs') {
              assign.pair_key = ((currentMembers + si) % groupSize) < 2 ? 'A' : 'B';
            }
            assignments.push(assign);
            playerIdx++;
            filled = true;
          }
          if (filled) groupsFilled++;
        }

        // Write all assignments in parallel batches of 20
        for (var bi = 0; bi < assignments.length; bi += 20) {
          var batch = assignments.slice(bi, bi + 20).map(function (a) {
            var patch = { group_id: a.group_id };
            if (a.pair_key) patch.pair_key = a.pair_key;
            return sb.sbPatch('players?id=eq.' + a.id, patch);
          });
          await Promise.all(batch);
        }

        // Clean up empty groups (one query, one delete)
        await deleteEmptyGroups(body.event_id);

        // Skip renumber when all groups were created fresh (already sequential)
        if (!freshGroups) {
          await renumberGroups(body.event_id);
        }

        var unassigned = players.length - playerIdx;
        var message = 'Filled ' + groupsFilled + ' group' + (groupsFilled === 1 ? '' : 's');
        if (unassigned > 0) message += ', ' + unassigned + ' unassigned';
        else message += ', all players assigned';

        return sb.respond(200, {
          ok: true,
          groups_created: createdGroups.length,
          groups_filled: groupsFilled,
          unassigned: unassigned,
          message: message
        });
      } catch (err) {
        console.error('org-groups auto_fill error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else if (action === 'assign') {
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

    } else if (action === 'delete_group') {
      if (!body.event_id || !body.organiser_id || !body.group_id) {
        return sb.respond(400, { error: 'Missing required fields' });
      }
      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        // Unassign all players in this group
        await sb.sbPatch('players?group_id=eq.' + body.group_id, { group_id: null, pair_key: null });

        // Delete the group
        await sb.sbDelete('groups?id=eq.' + body.group_id);

        // Renumber remaining groups
        await renumberGroups(body.event_id);

        return sb.respond(200, { ok: true });
      } catch (err) {
        console.error('org-groups delete error:', err);
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
