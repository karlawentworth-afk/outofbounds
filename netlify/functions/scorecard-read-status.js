'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'GET') return sb.respond(405, { error: 'Method not allowed' });

  var qs = event.queryStringParameters || {};
  var readId = qs.id;
  if (!readId) return sb.respond(400, { error: 'Missing id' });

  try {
    var rows = await sb.sbGet(
      'scorecard_reads?id=eq.' + encodeURIComponent(readId) +
      '&select=id,status,result,warnings,error_message,duration_ms,completed_at' +
      '&limit=1'
    );

    if (!rows || !rows.length) return sb.respond(404, { error: 'Not found' });

    var row = rows[0];

    // Parse JSON fields if they're strings
    if (typeof row.result === 'string') {
      try { row.result = JSON.parse(row.result); } catch (e) {}
    }
    if (typeof row.warnings === 'string') {
      try { row.warnings = JSON.parse(row.warnings); } catch (e) {}
    }

    return sb.respond(200, row);
  } catch (err) {
    console.error('scorecard-read-status error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
