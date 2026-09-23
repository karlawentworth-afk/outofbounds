'use strict';

var sb = require('./shared/supabase');
var planGate = require('./shared/plan-gate');
var https = require('https');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id || !body.event_id) {
    return sb.respond(400, { error: 'Missing organiser_id or event_id' });
  }

  try { await planGate.assertPro(body.organiser_id); }
  catch (e) { return sb.respond(e.status || 403, { error: e.error || 'Pro feature' }); }

  try {
    // GET send_log status (for polling progress)
    if (body.action === 'status') {
      var log = await sb.sbGet(
        'send_log?event_id=eq.' + body.event_id +
        '&organiser_id=eq.' + body.organiser_id +
        '&select=status'
      );
      var counts = { queued: 0, sent: 0, delivered: 0, bounced: 0, failed: 0 };
      (log || []).forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
      var total = (log || []).length;
      return sb.respond(200, { total: total, counts: counts });
    }

    // Queue invites for person_ids
    if (!body.person_ids || !Array.isArray(body.person_ids) || body.person_ids.length === 0) {
      return sb.respond(400, { error: 'Missing person_ids array' });
    }

    // Insert queued send_log rows
    var rows = body.person_ids.map(function (pid) {
      return {
        organiser_id: body.organiser_id,
        person_id: pid,
        event_id: body.event_id,
        status: 'queued'
      };
    });

    await sb.sbPost('send_log', rows);

    // Trigger background function
    var bgUrl = (process.env.APP_BASE_URL || 'https://score.outofboundsevents.com') +
      '/.netlify/functions/org-invite-send-background';

    var bgBody = JSON.stringify({
      organiser_id: body.organiser_id,
      event_id: body.event_id
    });

    // Fire-and-forget POST to the background function
    var bgReq = https.request(bgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bgBody) }
    });
    bgReq.on('error', function () {}); // ignore errors on fire-and-forget
    bgReq.write(bgBody);
    bgReq.end();

    return sb.respond(200, { queued: rows.length });
  } catch (err) {
    console.error('org-invite-send error:', err);
    return sb.respond(500, { error: err.message });
  }
};
