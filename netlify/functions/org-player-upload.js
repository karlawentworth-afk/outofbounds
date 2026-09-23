'use strict';

var sb = require('./shared/supabase');
var planGate = require('./shared/plan-gate');
var XLSX = require('xlsx');
var crypto = require('crypto');

var MAX_ROWS = 500;
var MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Match column headers to fields (case-insensitive) */
function matchColumns(headers) {
  var map = {};
  var patterns = {
    first_name: /^(first.?name|forename|first)$/i,
    last_name:  /^(last.?name|surname|family.?name|last)$/i,
    name:       /^(name|full.?name|player)$/i,
    email:      /^(email|e.?mail|email.?address)$/i,
    handicap:   /^(handicap|hcp|h\.?i\.?|handicap.?index|index)$/i
  };

  headers.forEach(function (h, i) {
    var trimmed = (h || '').trim();
    Object.keys(patterns).forEach(function (field) {
      if (patterns[field].test(trimmed) && !map[field]) {
        map[field] = i;
      }
    });
  });

  return map;
}

function validateEmail(email) {
  if (!email) return true; // nullable
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseRows(rawRows, colMap) {
  var rows = [];
  var errors = [];

  for (var i = 0; i < rawRows.length; i++) {
    if (i >= MAX_ROWS) {
      errors.push({ row: i + 2, error: 'Maximum ' + MAX_ROWS + ' rows. Remaining rows skipped.' });
      break;
    }

    var r = rawRows[i];
    var firstName = '', lastName = '';

    if (colMap.first_name !== undefined && colMap.last_name !== undefined) {
      firstName = ('' + (r[colMap.first_name] || '')).trim();
      lastName = ('' + (r[colMap.last_name] || '')).trim();
    } else if (colMap.name !== undefined) {
      var parts = ('' + (r[colMap.name] || '')).trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    if (!firstName && !lastName) continue; // skip blank rows

    var email = colMap.email !== undefined ? ('' + (r[colMap.email] || '')).trim() : '';
    var handicap = colMap.handicap !== undefined ? parseFloat(r[colMap.handicap]) : null;

    if (email && !validateEmail(email)) {
      errors.push({ row: i + 2, field: 'email', value: email, error: 'Invalid email address' });
    }

    if (handicap !== null && (isNaN(handicap) || handicap < -10 || handicap > 54)) {
      errors.push({ row: i + 2, field: 'handicap', value: r[colMap.handicap], error: 'Handicap must be between -10 and 54' });
      handicap = null;
    }

    rows.push({
      row_number: i + 2,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      handicap_index: handicap,
      errors: errors.filter(function (e) { return e.row === i + 2; })
    });
  }

  return { rows: rows, errors: errors };
}

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
    // Confirm action — insert the previewed rows
    if (body.action === 'confirm') {
      if (!body.players || !Array.isArray(body.players)) {
        return sb.respond(400, { error: 'Missing players array' });
      }

      var inserted = 0;
      for (var i = 0; i < body.players.length; i++) {
        var p = body.players[i];
        if (!p.first_name || !p.last_name) continue;

        // Create player
        await sb.sbPost('players', {
          event_id: body.event_id,
          first_name: p.first_name,
          last_name: p.last_name,
          display_name: p.first_name + ' ' + p.last_name,
          email: p.email || null,
          handicap_index: p.handicap_index || null,
          player_token: crypto.randomBytes(16).toString('hex')
        });

        // Upsert into people (Pro)
        if (p.email) {
          // Check existing by email
          var existing = await sb.sbGet(
            'people?organiser_id=eq.' + body.organiser_id +
            '&email=eq.' + encodeURIComponent(p.email) +
            '&deleted_at=is.null&select=id&limit=1'
          );
          if (existing && existing.length) {
            await sb.sbPatch('people?id=eq.' + existing[0].id, {
              handicap_index: p.handicap_index || null,
              last_event_at: new Date().toISOString()
            });
          } else {
            await sb.sbPost('people', {
              organiser_id: body.organiser_id,
              first_name: p.first_name,
              last_name: p.last_name,
              email: p.email,
              handicap_index: p.handicap_index || null,
              source: 'upload',
              last_event_at: new Date().toISOString(),
              events_count: 1
            });
          }
        } else {
          // No email — just create in people
          await sb.sbPost('people', {
            organiser_id: body.organiser_id,
            first_name: p.first_name,
            last_name: p.last_name,
            handicap_index: p.handicap_index || null,
            source: 'upload',
            last_event_at: new Date().toISOString(),
            events_count: 1
          });
        }

        inserted++;
      }

      return sb.respond(200, { ok: true, inserted: inserted });
    }

    // Preview action — parse the file
    if (!body.data) return sb.respond(400, { error: 'Missing data (base64 file content)' });

    var buf = Buffer.from(body.data, 'base64');
    if (buf.length > MAX_BYTES) {
      return sb.respond(400, { error: 'File too large. Maximum 2 MB.' });
    }

    var workbook;
    try {
      workbook = XLSX.read(buf, { type: 'buffer' });
    } catch (e) {
      return sb.respond(400, { error: 'Could not read file. Upload a CSV or XLSX.' });
    }

    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawData || rawData.length < 2) {
      return sb.respond(400, { error: 'File has no data rows. First row must be headers.' });
    }

    var headers = rawData[0].map(function (h) { return '' + (h || ''); });
    var dataRows = rawData.slice(1);

    if (dataRows.length > MAX_ROWS) {
      return sb.respond(400, { error: 'Too many rows (' + dataRows.length + '). Maximum ' + MAX_ROWS + '.' });
    }

    var colMap = matchColumns(headers);

    if (colMap.first_name === undefined && colMap.last_name === undefined && colMap.name === undefined) {
      return sb.respond(400, { error: 'Could not find a name column. Use headers like "First Name", "Last Name", or "Name".' });
    }

    var result = parseRows(dataRows, colMap);

    // Check for duplicates against existing people
    var existingPeople = await sb.sbGet(
      'people?organiser_id=eq.' + body.organiser_id +
      '&deleted_at=is.null&select=id,email,first_name,last_name'
    );

    var existingEmails = {};
    (existingPeople || []).forEach(function (p) {
      if (p.email) existingEmails[p.email.toLowerCase()] = p;
    });

    result.rows.forEach(function (r) {
      if (r.email && existingEmails[r.email.toLowerCase()]) {
        r.matched = existingEmails[r.email.toLowerCase()];
      }
    });

    var newCount = result.rows.filter(function (r) { return !r.matched; }).length;
    var matchedCount = result.rows.filter(function (r) { return !!r.matched; }).length;

    return sb.respond(200, {
      headers: headers,
      columns: colMap,
      preview: result.rows.slice(0, 10),
      total_rows: result.rows.length,
      new_count: newCount,
      matched_count: matchedCount,
      errors: result.errors,
      all_rows: result.rows
    });
  } catch (err) {
    console.error('org-player-upload error:', err);
    return sb.respond(500, { error: err.message });
  }
};
