'use strict';

var sb = require('./shared/supabase');

// Seeded categories with types
var SEED_CATEGORIES = [
  { category: '1st', prize_type: 'positional', sort_order: 0 },
  { category: '2nd', prize_type: 'positional', sort_order: 1 },
  { category: '3rd', prize_type: 'positional', sort_order: 2 },
  { category: 'Nearest the pin', prize_type: 'manual', sort_order: 3 },
  { category: 'Longest drive', prize_type: 'manual', sort_order: 4 }
];

async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId + '&organiser_id=eq.' + organiserId + '&select=id&limit=1'
  );
  return rows && rows.length > 0;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // GET: list prizes for event
  if (event.httpMethod === 'GET') {
    var eventId = qs.event_id;
    if (!eventId) return sb.respond(400, { error: 'Missing event_id' });

    try {
      var prizes = await sb.sbGet(
        'prizes?event_id=eq.' + eventId +
        '&select=id,category,prize_text,prize_type,player_id,sort_order' +
        '&order=sort_order.asc'
      );

      // Get players for the dropdown
      var players = await sb.sbGet(
        'players?event_id=eq.' + eventId +
        '&select=id,display_name&order=display_name.asc'
      );

      return sb.respond(200, {
        prizes: prizes || [],
        players: players || [],
        seed_categories: SEED_CATEGORIES
      });
    } catch (err) {
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.event_id || !body.organiser_id) return sb.respond(400, { error: 'Missing event_id or organiser_id' });

  var owns = await verifyOwnership(body.event_id, body.organiser_id);
  if (!owns) return sb.respond(403, { error: 'Event not found or not yours' });

  try {
    var action = body.action;

    // Seed default categories
    if (action === 'seed') {
      var existing = await sb.sbGet('prizes?event_id=eq.' + body.event_id + '&select=id&limit=1');
      if (existing && existing.length) return sb.respond(200, { ok: true, message: 'Already set up' });

      var rows = SEED_CATEGORIES.map(function (cat) {
        return {
          event_id: body.event_id,
          category: cat.category,
          prize_type: cat.prize_type,
          sort_order: cat.sort_order
        };
      });
      await sb.sbPost('prizes', rows);
      return sb.respond(200, { ok: true, seeded: rows.length });
    }

    // Save a single prize (update winner or prize text)
    if (action === 'save') {
      if (!body.prize_id) return sb.respond(400, { error: 'Missing prize_id' });
      var update = {};
      if (body.prize_text !== undefined) update.prize_text = body.prize_text;
      if (body.player_id !== undefined) update.player_id = body.player_id || null;
      if (body.category !== undefined) update.category = body.category;

      await sb.sbPatch('prizes?id=eq.' + body.prize_id, update);
      return sb.respond(200, { ok: true });
    }

    // Add a custom category
    if (action === 'add') {
      if (!body.category) return sb.respond(400, { error: 'Missing category' });
      var maxOrder = await sb.sbGet(
        'prizes?event_id=eq.' + body.event_id + '&select=sort_order&order=sort_order.desc&limit=1'
      );
      var nextOrder = (maxOrder && maxOrder[0]) ? maxOrder[0].sort_order + 1 : 0;

      var created = await sb.sbPost('prizes', {
        event_id: body.event_id,
        category: body.category,
        prize_type: 'manual',
        sort_order: nextOrder
      });
      return sb.respond(200, { prize: Array.isArray(created) ? created[0] : created });
    }

    // Auto-fill positional winners from leaderboard
    if (action === 'auto_fill') {
      // Get positional prizes
      var positional = await sb.sbGet(
        'prizes?event_id=eq.' + body.event_id +
        '&prize_type=eq.positional' +
        '&select=id,category,sort_order' +
        '&order=sort_order.asc'
      );

      if (!positional || !positional.length) {
        return sb.respond(200, { ok: true, filled: 0 });
      }

      // Get leaderboard standings
      var lbPlayers = await sb.sbGet(
        'players?event_id=eq.' + body.event_id + '&select=id,display_name'
      );
      // Simple: use the player list order by playing handicap adjusted points
      // For now, rely on the caller passing top player IDs
      if (body.top_player_ids && Array.isArray(body.top_player_ids)) {
        var filled = 0;
        for (var i = 0; i < positional.length && i < body.top_player_ids.length; i++) {
          await sb.sbPatch('prizes?id=eq.' + positional[i].id, {
            player_id: body.top_player_ids[i]
          });
          filled++;
        }
        return sb.respond(200, { ok: true, filled: filled });
      }

      return sb.respond(200, { ok: true, filled: 0, message: 'Pass top_player_ids' });
    }

    // Delete
    if (action === 'delete') {
      if (!body.prize_id) return sb.respond(400, { error: 'Missing prize_id' });
      await sb.sbDelete('prizes?id=eq.' + body.prize_id);
      return sb.respond(200, { ok: true });
    }

    return sb.respond(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('org-prizes error:', err);
    return sb.respond(500, { error: err.message });
  }
};
