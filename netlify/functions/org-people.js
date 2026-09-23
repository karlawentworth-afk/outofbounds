'use strict';

var sb = require('./shared/supabase');
var planGate = require('./shared/plan-gate');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // GET: search people
  if (event.httpMethod === 'GET') {
    var orgId = qs.organiser_id;
    if (!orgId) return sb.respond(400, { error: 'Missing organiser_id' });

    try { await planGate.assertPro(orgId); }
    catch (e) { return sb.respond(e.status || 403, { error: e.error || 'Pro feature' }); }

    try {
      var filter = 'people?organiser_id=eq.' + orgId +
        '&deleted_at=is.null' +
        '&select=id,first_name,last_name,email,handicap_index,source,last_event_at,events_count,created_at' +
        '&order=last_name.asc,first_name.asc';

      if (qs.search) {
        var s = encodeURIComponent('%' + qs.search + '%');
        filter += '&or=(first_name.ilike.' + s + ',last_name.ilike.' + s + ',email.ilike.' + s + ')';
      }

      filter += '&limit=' + (qs.limit || 100);
      if (qs.offset) filter += '&offset=' + qs.offset;

      var people = await sb.sbGet(filter);
      return sb.respond(200, { people: people || [] });
    } catch (err) {
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id) return sb.respond(400, { error: 'Missing organiser_id' });

  try { await planGate.assertPro(body.organiser_id); }
  catch (e) { return sb.respond(e.status || 403, { error: e.error || 'Pro feature' }); }

  try {
    var action = body.action;

    // Create or edit a person
    if (action === 'save') {
      if (!body.first_name || !body.last_name) {
        return sb.respond(400, { error: 'Missing first_name or last_name' });
      }

      if (body.id) {
        // Edit
        var update = {
          first_name: body.first_name,
          last_name: body.last_name
        };
        if (body.email !== undefined) update.email = body.email || null;
        if (body.handicap_index !== undefined) update.handicap_index = body.handicap_index;

        await sb.sbPatch('people?id=eq.' + body.id + '&organiser_id=eq.' + body.organiser_id, update);
        return sb.respond(200, { ok: true });
      } else {
        // Create
        var row = {
          organiser_id: body.organiser_id,
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email || null,
          handicap_index: body.handicap_index || null,
          source: body.source || 'typed'
        };

        var created = await sb.sbPost('people', row);
        return sb.respond(200, { person: Array.isArray(created) ? created[0] : created });
      }
    }

    // Soft delete
    if (action === 'delete') {
      if (!body.id) return sb.respond(400, { error: 'Missing id' });

      await sb.sbPatch(
        'people?id=eq.' + body.id + '&organiser_id=eq.' + body.organiser_id,
        { deleted_at: new Date().toISOString() }
      );
      return sb.respond(200, { ok: true });
    }

    // Add person to an event (creates a player row)
    if (action === 'add_to_event') {
      if (!body.person_id || !body.event_id) {
        return sb.respond(400, { error: 'Missing person_id or event_id' });
      }

      // Fetch person
      var persons = await sb.sbGet(
        'people?id=eq.' + body.person_id +
        '&organiser_id=eq.' + body.organiser_id +
        '&deleted_at=is.null' +
        '&select=first_name,last_name,email,handicap_index&limit=1'
      );
      if (!persons || !persons.length) return sb.respond(404, { error: 'Person not found' });
      var p = persons[0];

      var player = {
        event_id: body.event_id,
        first_name: p.first_name,
        last_name: p.last_name,
        display_name: p.first_name + ' ' + p.last_name,
        email: p.email,
        handicap_index: p.handicap_index,
        player_token: require('crypto').randomBytes(16).toString('hex')
      };

      var created = await sb.sbPost('players', player);
      return sb.respond(200, { player: Array.isArray(created) ? created[0] : created });
    }

    return sb.respond(400, { error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('org-people error:', err);
    return sb.respond(500, { error: err.message });
  }
};
