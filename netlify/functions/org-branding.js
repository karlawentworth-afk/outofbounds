'use strict';

var sb = require('./shared/supabase');
var planGate = require('./shared/plan-gate');

// WCAG contrast — same logic as public/shared/contrast.js
function linearize(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(r, g, b) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
function parseHex(hex) {
  hex = (hex || '').replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return null;
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}
function contrastRatio(hex1, hex2) {
  var c1 = parseHex(hex1), c2 = parseHex(hex2);
  if (!c1 || !c2) return 1;
  var l1 = luminance(c1.r, c1.g, c1.b), l2 = luminance(c2.r, c2.g, c2.b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function textColour(bgHex) {
  var bk = contrastRatio(bgHex, '#000000');
  var wh = contrastRatio(bgHex, '#FFFFFF');
  var best = bk >= wh ? '#000000' : '#FFFFFF';
  var ratio = Math.max(bk, wh);
  var level = ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'warn' : 'fail';
  return { colour: best, ratio: Math.round(ratio * 100) / 100, level: level };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // GET: return current branding
  if (event.httpMethod === 'GET') {
    var orgId = qs.organiser_id;
    if (!orgId) return sb.respond(400, { error: 'Missing organiser_id' });

    try {
      await planGate.assertPro(orgId);
    } catch (e) {
      return sb.respond(e.status || 403, { error: e.error || 'Pro feature' });
    }

    try {
      var orgs = await sb.sbGet(
        'organisers?id=eq.' + orgId +
        '&select=logo_url,logo_dark_url,primary_colour,secondary_colour,accent_colour,text_on_primary,display_name' +
        '&limit=1'
      );
      if (!orgs || !orgs.length) return sb.respond(404, { error: 'Not found' });

      // Also get recent versions
      var versions = await sb.sbGet(
        'branding_versions?organiser_id=eq.' + orgId +
        '&select=id,created_at,primary_colour,display_name&order=created_at.desc&limit=10'
      );

      return sb.respond(200, { branding: orgs[0], versions: versions || [] });
    } catch (err) {
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id) return sb.respond(400, { error: 'Missing organiser_id' });

  try {
    await planGate.assertPro(body.organiser_id);
  } catch (e) {
    return sb.respond(e.status || 403, { error: e.error || 'Pro feature' });
  }

  try {
    // Save branding
    var warnings = [];
    var update = {};

    if (body.primary_colour !== undefined) {
      var pc = textColour(body.primary_colour);
      if (pc.level === 'fail') {
        return sb.respond(400, {
          error: 'Primary colour is hard to read on buttons. Neither black nor white text reaches 3:1 contrast. Try a darker or lighter shade.',
          ratio: pc.ratio
        });
      }
      if (pc.level === 'warn') {
        warnings.push('Primary colour contrast is ' + pc.ratio + ':1 — below the recommended 4.5:1. Text may be hard to read.');
      }
      update.primary_colour = body.primary_colour;
      update.text_on_primary = pc.colour;
    }

    var textOnSecondary = null;
    if (body.secondary_colour !== undefined) {
      var sc = textColour(body.secondary_colour);
      if (sc.level === 'fail') {
        return sb.respond(400, {
          error: 'Secondary colour is hard to read. Neither black nor white reaches 3:1 contrast. Try a darker or lighter shade.',
          ratio: sc.ratio
        });
      }
      if (sc.level === 'warn') {
        warnings.push('Secondary colour contrast is ' + sc.ratio + ':1 — below the recommended 4.5:1.');
      }
      update.secondary_colour = body.secondary_colour;
      textOnSecondary = sc.colour;
    }

    if (body.accent_colour !== undefined) update.accent_colour = body.accent_colour;
    if (body.logo_url !== undefined) update.logo_url = body.logo_url;
    if (body.logo_dark_url !== undefined) update.logo_dark_url = body.logo_dark_url;
    if (body.display_name !== undefined) update.display_name = body.display_name;

    if (Object.keys(update).length === 0) {
      return sb.respond(400, { error: 'No branding fields to update' });
    }

    // Save to organisers
    await sb.sbPatch('organisers?id=eq.' + body.organiser_id, update);

    // Insert version snapshot
    var snapshot = {
      organiser_id: body.organiser_id,
      logo_url: body.logo_url || null,
      logo_dark_url: body.logo_dark_url || null,
      primary_colour: body.primary_colour || null,
      secondary_colour: body.secondary_colour || null,
      accent_colour: body.accent_colour || null,
      text_on_primary: update.text_on_primary || null,
      text_on_secondary: textOnSecondary,
      display_name: body.display_name || null
    };
    await sb.sbPost('branding_versions', snapshot);

    return sb.respond(200, { ok: true, warnings: warnings, text_on_primary: update.text_on_primary, text_on_secondary: textOnSecondary });
  } catch (err) {
    console.error('org-branding error:', err);
    return sb.respond(500, { error: err.message });
  }
};
