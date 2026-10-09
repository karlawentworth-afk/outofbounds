'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

/**
 * Temporary token exchange for native app OAuth flow.
 * POST with {code, access_token, refresh_token} stores tokens.
 * GET with ?code=xxx retrieves and deletes them.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  // Store tokens
  if (event.httpMethod === 'POST') {
    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

    if (!body.access_token) return sb.respond(400, { error: 'Missing access_token' });
    if (!body.code) return sb.respond(400, { error: 'Missing code' });

    var code = body.code;
    var expires = new Date(Date.now() + 120000).toISOString(); // 2 minutes

    await sb.sbPost('auth_codes', {
      code: code,
      access_token: body.access_token,
      refresh_token: body.refresh_token || null,
      expires_at: expires
    });

    return sb.respond(200, { ok: true });
  }

  // Retrieve tokens
  if (event.httpMethod === 'GET') {
    var qs = event.queryStringParameters || {};
    if (!qs.code) return sb.respond(400, { error: 'Missing code' });

    var rows = await sb.sbGet(
      'auth_codes?code=eq.' + encodeURIComponent(qs.code) +
      '&select=access_token,refresh_token,expires_at&limit=1'
    );

    if (!rows || !rows.length) return sb.respond(404, { error: 'Code not found or expired' });

    var row = rows[0];

    // Delete the code (one-time use)
    sb.sbDelete('auth_codes?code=eq.' + encodeURIComponent(qs.code)).catch(function () {});

    // Check expiry
    if (new Date(row.expires_at) < new Date()) {
      return sb.respond(410, { error: 'Code expired' });
    }

    return sb.respond(200, {
      access_token: row.access_token,
      refresh_token: row.refresh_token
    });
  }

  return sb.respond(405, { error: 'Method not allowed' });
};

