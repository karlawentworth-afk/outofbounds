'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

/** Upsert players into the people table (Pro organisers only). */
async function upsertPeople(organiserId, players) {
  var planGate = require('./shared/plan-gate');
  var isPro = await planGate.isPro(organiserId);
  if (!isPro) return;

  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    if (!p.first_name && !p.last_name) continue;

    try {
      if (p.email) {
        var existing = await sb.sbGet(
          'people?organiser_id=eq.' + organiserId +
          '&email=eq.' + encodeURIComponent(p.email) +
          '&deleted_at=is.null&select=id&limit=1'
        );
        if (existing && existing.length) {
          await sb.sbPatch('people?id=eq.' + existing[0].id, {
            handicap_index: p.handicap_index || null,
            last_event_at: new Date().toISOString()
          });
          continue;
        }
      }
      await sb.sbPost('people', {
        organiser_id: organiserId,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        email: p.email || null,
        handicap_index: p.handicap_index || null,
        source: 'typed',
        last_event_at: new Date().toISOString(),
        events_count: 1
      });
    } catch (e) {
      // Swallow — people upsert is best-effort
      console.warn('People upsert failed:', e.message);
    }
  }
}

/**
 * Verify organiser owns the event.
 */
async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&organiser_id=eq.' + organiserId +
    '&select=id,organiser_id,course_id,tee_id,format,handicap_allowance,max_handicap' +
    '&limit=1'
  );
  return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Compute playing handicap for a player given event settings and tee data.
 */
function computePlayingHandicap(index, slope, rating, par, allowance, cap) {
  if (index == null) return null;
  slope     = slope     || 113;
  rating    = rating    || par || 72;
  par       = par       || 72;
  allowance = allowance != null ? allowance : 0.95;
  cap       = cap       != null ? cap : 54;
  var raw = index * (slope / 113) + (rating - par);
  return Math.min(Math.round(raw * allowance), cap);
}

/**
 * Get tee data for an event.
 */
async function getTeeData(event) {
  if (!event.tee_id) return { slope: 113, rating: 72, par_total: 72 };
  var tees = await sb.sbGet(
    'course_tees?id=eq.' + event.tee_id +
    '&select=slope,rating,par_total&limit=1'
  );
  if (tees && tees.length > 0) return tees[0];
  return { slope: 113, rating: 72, par_total: 72 };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }

  var qs = event.queryStringParameters || {};

  // GET: list players
  if (event.httpMethod === 'GET') {
    var eventId = qs.event_id;
    var organiserId = qs.organiser_id;
    if (!eventId || !organiserId) {
      return sb.respond(400, { error: 'Missing event_id or organiser_id' });
    }
    try {
      var ev = await verifyOwnership(eventId, organiserId);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      var players = await sb.sbGet(
        'players?event_id=eq.' + eventId +
        '&select=id,first_name,last_name,display_name,handicap_index,playing_handicap,group_id,pair_key,player_token,player_status,handicap_source,email' +
        '&order=created_at.asc'
      );

      return sb.respond(200, { players: players || [] });
    } catch (err) {
      console.error('org-players GET error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH' && event.httpMethod !== 'DELETE') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  // DELETE: remove player
  if (event.httpMethod === 'DELETE' || (event.httpMethod === 'POST' && body.action === 'delete')) {
    if (!body.id || !body.organiser_id || !body.event_id) {
      return sb.respond(400, { error: 'Missing id, event_id, or organiser_id' });
    }
    try {
      var ev = await verifyOwnership(body.event_id, body.organiser_id);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      // Check for scores
      var scores = await sb.sbGet(
        'hole_scores?player_id=eq.' + body.id +
        '&select=id&limit=1'
      );
      if (scores && scores.length > 0) {
        return sb.respond(400, { error: 'Cannot delete player with scores' });
      }

      // Use PATCH to soft-delete isn't in schema; we need a real DELETE via REST
      // Supabase REST supports DELETE method
      var https = require('https');
      var key = process.env.SUPABASE_SERVICE_KEY;
      await new Promise(function (resolve, reject) {
        var opts = {
          hostname: 'ahutmswadskdkqhnrhhh.supabase.co',
          port: 443,
          path: '/rest/v1/players?id=eq.' + body.id,
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
          res.on('end', function () {
            clearTimeout(timer);
            resolve();
          });
        });
        req.on('error', function (err) { clearTimeout(timer); reject(err); });
        req.end();
      });

      return sb.respond(200, { ok: true });
    } catch (err) {
      console.error('org-players DELETE error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  // PATCH: update player
  if (event.httpMethod === 'PATCH') {
    if (!body.id || !body.organiser_id || !body.event_id) {
      return sb.respond(400, { error: 'Missing id, event_id, or organiser_id' });
    }
    try {
      var ev = await verifyOwnership(body.event_id, body.organiser_id);
      if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

      var allowed = ['first_name', 'last_name', 'display_name', 'handicap_index', 'playing_handicap', 'group_id', 'pair_key'];
      var update = {};
      allowed.forEach(function (k) {
        if (body[k] !== undefined) update[k] = body[k];
      });

      // Recompute playing handicap if index changed
      if (body.handicap_index !== undefined) {
        // Check if player has existing scores — if so, require a reason
        var existingScores = await sb.sbGet(
          'hole_scores?player_id=eq.' + body.id +
          '&event_id=eq.' + body.event_id +
          '&select=id&limit=1'
        );
        if (existingScores && existingScores.length > 0) {
          if (!body.reason || !body.reason.trim()) {
            return sb.respond(400, { error: 'Reason required when changing handicap after scores exist' });
          }
          // Fetch old index for audit log
          var oldPlayer = await sb.sbGet(
            'players?id=eq.' + body.id + '&select=handicap_index&limit=1'
          );
          var oldIndex = (oldPlayer && oldPlayer[0]) ? oldPlayer[0].handicap_index : null;
          // Log handicap change to score_edits (hole_number 0 = handicap change convention)
          await sb.sbPost('score_edits', {
            event_id: body.event_id,
            player_id: body.id,
            hole_number: 0,
            old_gross: oldIndex,
            new_gross: body.handicap_index,
            old_picked_up: false,
            new_picked_up: false,
            edited_by: body.organiser_id,
            reason: body.reason.trim()
          });
        }

        var tee = await getTeeData(ev);
        update.playing_handicap = computePlayingHandicap(
          body.handicap_index,
          parseFloat(tee.slope),
          parseFloat(tee.rating),
          tee.par_total,
          parseFloat(ev.handicap_allowance),
          ev.max_handicap
        );
      }

      if (body.first_name !== undefined || body.last_name !== undefined) {
        // Fetch current values for display_name update
        var current = await sb.sbGet('players?id=eq.' + body.id + '&select=first_name,last_name&limit=1');
        var fn = body.first_name !== undefined ? body.first_name : (current && current[0] ? current[0].first_name : '');
        var ln = body.last_name !== undefined ? body.last_name : (current && current[0] ? current[0].last_name : '');
        update.display_name = (fn + ' ' + ln).trim();
      }

      var updated = await sb.sbPatch('players?id=eq.' + body.id, update);

      return sb.respond(200, { player: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('org-players PATCH error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  // POST: add players or paste
  if (event.httpMethod === 'POST') {
    var action = body.action;

    if (action === 'paste') {
      if (!body.event_id || !body.organiser_id || !body.text) {
        return sb.respond(400, { error: 'Missing event_id, organiser_id, or text' });
      }

      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        var tee = await getTeeData(ev);
        var lines = body.text.split(/\n/).filter(function (l) { return l.trim(); });
        var players = [];

        lines.forEach(function (line) {
          line = line.trim();
          if (!line) return;

          // Parse "First Last, 18.4" or "First Last"
          var parts = line.split(',');
          var namePart = (parts[0] || '').trim();
          var indexPart = parts.length > 1 ? parts[1].trim() : null;

          if (!namePart) return;

          var nameParts = namePart.split(/\s+/);
          var firstName = nameParts[0] || '';
          var lastName = nameParts.slice(1).join(' ') || '';
          var handicapIndex = indexPart ? parseFloat(indexPart) : null;
          if (handicapIndex !== null && isNaN(handicapIndex)) handicapIndex = null;

          var ph = computePlayingHandicap(
            handicapIndex,
            parseFloat(tee.slope),
            parseFloat(tee.rating),
            tee.par_total,
            parseFloat(ev.handicap_allowance),
            ev.max_handicap
          );

          players.push({
            event_id: body.event_id,
            first_name: firstName,
            last_name: lastName,
            display_name: (firstName + ' ' + lastName).trim(),
            handicap_index: handicapIndex,
            playing_handicap: ph,
            player_token: genToken()
          });
        });

        if (players.length === 0) {
          return sb.respond(400, { error: 'No valid players found in text' });
        }

        var created = await sb.sbPost('players', players);

        // Upsert into people (Pro only, best-effort)
        await upsertPeople(body.organiser_id, players);

        return sb.respond(200, { players: Array.isArray(created) ? created : [created], count: players.length });
      } catch (err) {
        console.error('org-players paste error:', err);
        return sb.respond(500, { error: err.message });
      }

    } else {
      // Add players array
      if (!body.event_id || !body.organiser_id) {
        return sb.respond(400, { error: 'Missing event_id or organiser_id' });
      }
      if (!Array.isArray(body.players) || body.players.length === 0) {
        return sb.respond(400, { error: 'players must be a non-empty array' });
      }

      try {
        var ev = await verifyOwnership(body.event_id, body.organiser_id);
        if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

        var tee = await getTeeData(ev);

        var rows = body.players.map(function (p) {
          var hi = p.handicap_index != null ? parseFloat(p.handicap_index) : null;
          if (hi !== null && isNaN(hi)) hi = null;

          var ph = computePlayingHandicap(
            hi,
            parseFloat(tee.slope),
            parseFloat(tee.rating),
            tee.par_total,
            parseFloat(ev.handicap_allowance),
            ev.max_handicap
          );

          return {
            event_id: body.event_id,
            first_name: (p.first_name || '').trim(),
            last_name: (p.last_name || '').trim(),
            display_name: ((p.first_name || '') + ' ' + (p.last_name || '')).trim(),
            handicap_index: hi,
            playing_handicap: ph,
            player_token: genToken()
          };
        });

        var created = await sb.sbPost('players', rows);

        // Upsert into people (Pro only, best-effort)
        await upsertPeople(body.organiser_id, rows);

        return sb.respond(200, { players: Array.isArray(created) ? created : [created] });
      } catch (err) {
        console.error('org-players POST error:', err);
        return sb.respond(500, { error: err.message });
      }
    }
  }
};
