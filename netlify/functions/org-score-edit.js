'use strict';

var sb = require('./shared/supabase');

/**
 * Verify organiser owns the event. Returns event row or null.
 */
async function verifyOwnership(eventId, organiserId) {
  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&organiser_id=eq.' + organiserId +
    '&select=id,status,organiser_id' +
    '&limit=1'
  );
  return (rows && rows.length > 0) ? rows[0] : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  var organiserId = body.organiser_id;
  var eventId = body.event_id;
  var playerId = body.player_id;
  var holeNumber = body.hole_number;
  var reason = body.reason;

  if (!organiserId || !eventId || !playerId) {
    return sb.respond(400, { error: 'Missing organiser_id, event_id, or player_id' });
  }
  if (typeof holeNumber !== 'number' || holeNumber < 1 || holeNumber > 18) {
    return sb.respond(400, { error: 'hole_number must be 1-18' });
  }
  if (!reason || !reason.trim()) {
    return sb.respond(400, { error: 'reason is required' });
  }

  try {
    var ev = await verifyOwnership(eventId, organiserId);
    if (!ev) return sb.respond(403, { error: 'Event not found or not yours' });

    // Read existing hole_score
    var existing = await sb.sbGet(
      'hole_scores?event_id=eq.' + eventId +
      '&player_id=eq.' + playerId +
      '&hole_number=eq.' + holeNumber +
      '&select=id,gross_score,picked_up' +
      '&limit=1'
    );

    var oldGross = null;
    var oldPickedUp = false;
    if (existing && existing.length > 0) {
      oldGross = existing[0].gross_score;
      oldPickedUp = !!existing[0].picked_up;
    }

    var newGross = body.new_gross !== undefined ? body.new_gross : oldGross;
    var newPickedUp = body.new_picked_up !== undefined ? !!body.new_picked_up : oldPickedUp;

    // Write to score_edits audit log
    var editRow = {
      event_id: eventId,
      player_id: playerId,
      hole_number: holeNumber,
      old_gross: oldGross,
      new_gross: newGross,
      old_picked_up: oldPickedUp,
      new_picked_up: newPickedUp,
      edited_by: organiserId,
      reason: reason.trim()
    };

    var editResult = await sb.sbPost('score_edits', editRow);
    var edit = Array.isArray(editResult) ? editResult[0] : editResult;

    // Upsert the new score to hole_scores
    var scoreRow = {
      event_id: eventId,
      player_id: playerId,
      hole_number: holeNumber,
      gross_score: newPickedUp ? null : newGross,
      picked_up: newPickedUp,
      updated_at: new Date().toISOString()
    };

    await sb.sbPost(
      'hole_scores?on_conflict=event_id,player_id,hole_number',
      scoreRow
    );

    return sb.respond(200, { ok: true, edit_id: edit ? edit.id : null });
  } catch (err) {
    console.error('org-score-edit error:', err);
    return sb.respond(500, { error: err.message });
  }
};
