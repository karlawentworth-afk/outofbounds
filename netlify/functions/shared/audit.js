'use strict';

var sb = require('./supabase');

/**
 * Write an event audit row.
 * @param {string} eventId
 * @param {string} action - e.g. 'player_added', 'player_removed', 'player_moved', 'tee_time_changed', 'starting_hole_changed'
 * @param {object} detail - JSON with old/new values
 * @param {string} editedBy - organiser ID
 */
function log(eventId, action, detail, editedBy) {
  return sb.sbPost('event_audit', {
    event_id: eventId,
    action: action,
    detail: detail,
    edited_by: editedBy
  }).catch(function (err) {
    console.warn('Audit log failed:', err.message);
  });
}

module.exports = { log: log };
