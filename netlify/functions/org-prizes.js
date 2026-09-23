'use strict';

var sb = require('./shared/supabase');

var SEED_CATEGORIES = [
  'Winners', 'Runners up', 'Third',
  'Nearest the pin', 'Longest drive',
  'Best front nine', 'Best back nine'
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
        '&select=id,category,winner_text,player_id,sort_order' +
        '&order=sort_order.asc'
      );
      return sb.respond(200, { prizes: prizes || [], seed_categories: SEED_CATEGORIES });
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
      if (existing && existing.length) return sb.respond(200, { ok: true, message: 'Already seeded' });

      var rows = SEED_CATEGORIES.map(function (cat, i) {
        return { event_id: body.event_id, category: cat, sort_order: i };
      });
      await sb.sbPost('prizes', rows);
      return sb.respond(200, { ok: true, seeded: rows.length });
    }

    // Save a single prize
    if (action === 'save') {
      if (!body.prize_id) return sb.respond(400, { error: 'Missing prize_id' });
      var update = {};
      if (body.winner_text !== undefined) update.winner_text = body.winner_text;
      if (body.player_id !== undefined) update.player_id = body.player_id || null;
      if (body.category !== undefined) update.category = body.category;
      if (body.sort_order !== undefined) update.sort_order = body.sort_order;

      await sb.sbPatch('prizes?id=eq.' + body.prize_id, update);
      return sb.respond(200, { ok: true });
    }

    // Add a custom prize
    if (action === 'add') {
      if (!body.category) return sb.respond(400, { error: 'Missing category' });
      var maxOrder = await sb.sbGet(
        'prizes?event_id=eq.' + body.event_id + '&select=sort_order&order=sort_order.desc&limit=1'
      );
      var nextOrder = (maxOrder && maxOrder[0]) ? maxOrder[0].sort_order + 1 : 0;

      var created = await sb.sbPost('prizes', {
        event_id: body.event_id,
        category: body.category,
        sort_order: nextOrder
      });
      return sb.respond(200, { prize: Array.isArray(created) ? created[0] : created });
    }

    // Delete a prize
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
