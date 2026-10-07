'use strict';

var sb = require('./shared/supabase');

/**
 * Send results email to all players with an email address.
 * POST with action:'count' returns { with_email, total } without sending.
 * POST with action:'send' (default) sends and returns { sent, failed, total }.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.event_id || !body.organiser_id) return sb.respond(400, { error: 'Missing event_id or organiser_id' });

  try {
    // Verify ownership
    var events = await sb.sbGet(
      'events?id=eq.' + body.event_id + '&organiser_id=eq.' + body.organiser_id +
      '&select=id,name,slug,status,charity_name,charity_url&limit=1'
    );
    if (!events || !events.length) return sb.respond(403, { error: 'Event not found or not yours' });
    var ev = events[0];

    // Get organiser
    var orgs = await sb.sbGet(
      'organisers?id=eq.' + body.organiser_id +
      '&select=name,display_name,slug,logo_url,primary_colour,text_on_primary,contact_email&limit=1'
    );
    var org = (orgs && orgs[0]) || {};
    var orgName = org.display_name || org.name || '';

    // Get players with emails
    var players = await sb.sbGet(
      'players?event_id=eq.' + body.event_id +
      '&select=id,display_name,email,player_token&order=display_name.asc'
    );

    var allPlayers = players || [];
    var withEmail = allPlayers.filter(function (p) { return p.email; });

    // Count-only mode: return counts without sending
    if (body.action === 'count') {
      return sb.respond(200, { with_email: withEmail.length, total: allPlayers.length });
    }

    if (!withEmail.length) return sb.respond(200, { sent: 0, failed: 0, total: allPlayers.length, message: 'No players have email addresses' });

    // Build results URL
    var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';
    var resultsUrl = baseUrl + '/r/' + org.slug + '/' + ev.slug;

    var apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return sb.respond(500, { error: 'RESEND_API_KEY not set' });

    var fromAddr = process.env.RESEND_FROM || 'noreply@outofboundsevents.com';
    var brandColour = org.primary_colour || '#2F7A45';
    var brandText = org.text_on_primary || '#FFFFFF';
    var sent = 0;
    var failed = 0;
    var errors = [];

    for (var i = 0; i < withEmail.length; i++) {
      var p = withEmail[i];

      var html = '<div style="max-width:560px;margin:0 auto;font-family:sans-serif;">';
      if (org.logo_url) {
        html += '<div style="text-align:center;padding:20px 0;"><img src="' + org.logo_url + '" alt="' + escHtml(orgName) + '" style="max-height:48px;"></div>';
      }
      html += '<h2 style="margin:0 0 8px;">Results: ' + escHtml(ev.name) + '</h2>';
      html += '<p><a href="' + resultsUrl + '" style="display:inline-block;padding:12px 28px;background:' + brandColour + ';color:' + brandText + ';text-decoration:none;border-radius:999px;font-weight:600;">View full results</a></p>';

      // Charity
      if (ev.charity_name) {
        html += '<div style="margin-top:20px;padding:12px;background:#f0f9ff;border-radius:8px;">';
        html += '<strong>' + escHtml(ev.charity_name) + '</strong>';
        if (ev.charity_url) html += ' &mdash; <a href="' + ev.charity_url + '" style="color:' + brandColour + ';">Donate</a>';
        html += '</div>';
      }

      html += '<p style="font-size:11px;color:#999;margin-top:24px;">Scored with Out of Bounds</p>';
      html += '</div>';

      try {
        var res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: orgName + ' via Out of Bounds <' + fromAddr + '>',
            to: [p.email],
            reply_to: org.contact_email || undefined,
            subject: 'Results: ' + ev.name,
            html: html
          })
        });

        var resBody = await res.json().catch(function () { return {}; });

        if (res.ok) {
          sent++;
        } else {
          failed++;
          var errMsg = resBody.message || ('Resend ' + res.status);
          console.error('Results email failed for ' + p.email + ': ' + errMsg);
          errors.push(p.email + ': ' + errMsg);
        }
      } catch (emailErr) {
        failed++;
        console.error('Results email error for ' + p.email + ':', emailErr.message);
        errors.push(p.email + ': ' + emailErr.message);
      }

      // Rate limit: 10 per second
      if ((i + 1) % 10 === 0) {
        await new Promise(function (r) { setTimeout(r, 1000); });
      }
    }

    var result = { sent: sent, failed: failed, total: allPlayers.length, with_email: withEmail.length };
    if (errors.length) result.errors = errors;
    return sb.respond(200, result);
  } catch (err) {
    console.error('results-email error:', err);
    return sb.respond(500, { error: err.message });
  }
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
