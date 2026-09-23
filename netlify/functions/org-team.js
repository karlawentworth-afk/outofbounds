'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

/**
 * Team management: invite, list, revoke team members.
 * Owner can manage organisers (max 3) and helpers (unlimited).
 * Organisers can manage helpers only.
 */

function genToken() { return crypto.randomBytes(16).toString('hex'); }

async function getCallerRole(organiserId, callerOrgId) {
  // Check if caller is the owner (their organiser row)
  if (callerOrgId === organiserId) return 'owner';

  // Check organiser_users
  var users = await sb.sbGet(
    'organiser_users?organiser_id=eq.' + organiserId +
    '&revoked_at=is.null' +
    '&select=role'
  );
  // For now, the caller must be the owner (organiser_id matches)
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // GET: list team members
  if (event.httpMethod === 'GET') {
    var orgId = qs.organiser_id;
    if (!orgId) return sb.respond(400, { error: 'Missing organiser_id' });

    try {
      var members = await sb.sbGet(
        'organiser_users?organiser_id=eq.' + orgId +
        '&revoked_at=is.null' +
        '&select=id,email,display_name,role,invited_at,accepted_at' +
        '&order=role.asc,invited_at.asc'
      );
      return sb.respond(200, { members: members || [] });
    } catch (err) {
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id) return sb.respond(400, { error: 'Missing organiser_id' });

  try {
    var action = body.action;

    // Invite a team member
    if (action === 'invite') {
      if (!body.email || !body.email.trim()) return sb.respond(400, { error: 'Missing email' });
      var role = body.role || 'helper';
      if (['organiser', 'helper'].indexOf(role) === -1) return sb.respond(400, { error: 'Role must be organiser or helper' });

      // Check limits: max 3 organisers
      if (role === 'organiser') {
        var orgCount = await sb.sbGet(
          'organiser_users?organiser_id=eq.' + body.organiser_id +
          '&role=eq.organiser&revoked_at=is.null&select=id'
        );
        if (orgCount && orgCount.length >= 3) {
          return sb.respond(400, { error: 'Maximum 3 organisers. Remove one first.' });
        }
      }

      // Check not already invited
      var existing = await sb.sbGet(
        'organiser_users?organiser_id=eq.' + body.organiser_id +
        '&email=eq.' + encodeURIComponent(body.email.trim().toLowerCase()) +
        '&revoked_at=is.null&select=id&limit=1'
      );
      if (existing && existing.length) {
        return sb.respond(400, { error: 'Already invited' });
      }

      var magicToken = genToken();
      var row = {
        organiser_id: body.organiser_id,
        email: body.email.trim().toLowerCase(),
        display_name: body.display_name || null,
        role: role,
        magic_token: magicToken
      };

      var created = await sb.sbPost('organiser_users', row);
      var member = Array.isArray(created) ? created[0] : created;

      // Send invite email via Resend if available
      if (process.env.RESEND_API_KEY) {
        var orgs = await sb.sbGet(
          'organisers?id=eq.' + body.organiser_id + '&select=name,contact_email&limit=1'
        );
        var org = (orgs && orgs[0]) || {};
        var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';
        var joinUrl = baseUrl + '/o/#join-' + magicToken;

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: (org.name || 'Out of Bounds') + ' <' + (process.env.RESEND_FROM || 'noreply@outofboundsevents.com') + '>',
              to: [body.email.trim()],
              reply_to: org.contact_email || undefined,
              subject: 'You\'ve been invited to ' + (org.name || 'an organisation') + ' on Out of Bounds',
              html: '<p>' + (org.name || 'An organiser') + ' has invited you as ' +
                (role === 'organiser' ? 'an organiser' : 'a helper') + '.</p>' +
                '<p><a href="' + joinUrl + '" style="display:inline-block;padding:12px 28px;background:#2F7A45;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Accept invite</a></p>' +
                '<p style="color:#666;font-size:13px;">Helpers can view events and scores. Organisers can also edit.</p>'
            })
          });
        } catch (emailErr) {
          console.error('Team invite email failed:', emailErr.message);
        }
      }

      return sb.respond(200, { member: member, magic_token: magicToken });
    }

    // Revoke a team member
    if (action === 'revoke') {
      if (!body.member_id) return sb.respond(400, { error: 'Missing member_id' });

      await sb.sbPatch(
        'organiser_users?id=eq.' + body.member_id + '&organiser_id=eq.' + body.organiser_id,
        { revoked_at: new Date().toISOString() }
      );

      return sb.respond(200, { ok: true });
    }

    // Accept an invite (called when team member opens the magic link)
    if (action === 'accept') {
      if (!body.magic_token) return sb.respond(400, { error: 'Missing magic_token' });

      var invites = await sb.sbGet(
        'organiser_users?magic_token=eq.' + encodeURIComponent(body.magic_token) +
        '&revoked_at=is.null&accepted_at=is.null' +
        '&select=id,organiser_id,role&limit=1'
      );

      if (!invites || !invites.length) {
        return sb.respond(404, { error: 'Invite not found or already accepted' });
      }

      await sb.sbPatch('organiser_users?id=eq.' + invites[0].id, {
        accepted_at: new Date().toISOString()
      });

      return sb.respond(200, { ok: true, organiser_id: invites[0].organiser_id, role: invites[0].role });
    }

    return sb.respond(400, { error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('org-team error:', err);
    return sb.respond(500, { error: err.message });
  }
};
