'use strict';

var sb = require('./shared/supabase');
var https = require('https');
var auth = require('./_auth');

var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';

/**
 * Verify a Supabase Auth JWT by calling /auth/v1/user with it.
 * Returns the user object or null.
 */
function verifyAuthToken(token) {
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return Promise.reject(new Error('SUPABASE_SERVICE_KEY not set'));

  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: SB_HOST,
      port: 443,
      path: '/auth/v1/user',
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + token
      }
    };

    var timer = setTimeout(function () {
      reject(new Error('Auth verification timed out'));
    }, 9000);

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

/**
 * Delete a Supabase auth user via the admin API.
 */
function deleteAuthUser(userId) {
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return Promise.reject(new Error('SUPABASE_SERVICE_KEY not set'));

  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: SB_HOST,
      port: 443,
      path: '/auth/v1/admin/users/' + userId,
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
      }
    };

    var timer = setTimeout(function () {
      reject(new Error('Auth delete timed out'));
    }, 9000);

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          var raw = Buffer.concat(chunks).toString();
          reject(new Error('Auth delete failed: ' + res.statusCode + ' ' + raw));
          return;
        }
        resolve();
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  // Auth: prefer Authorization header, fall back to body.auth_token
  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  try {
    var user;
    var headerToken = auth.extractToken(event);
    if (headerToken) {
      // Use header-based auth (preferred)
      var authed = await auth.requireUser(event);
      user = { id: authed.user_id, email: authed.email };
    } else if (body.auth_token) {
      // Legacy: token in body
      user = await verifyAuthToken(body.auth_token);
      if (!user || !user.id) {
        return sb.respond(401, { error: 'Invalid or expired token' });
      }
    } else {
      return sb.respond(401, { error: 'Missing Authorization header' });
    }

    // Look up the organiser
    var orgs = await sb.sbGet(
      'organisers?auth_user_id=eq.' + user.id +
      '&select=id,slug&limit=1'
    );

    if (!orgs || !orgs.length) {
      return sb.respond(404, { error: 'No organiser account found' });
    }

    var org = orgs[0];

    // Never delete the demo organiser
    if (org.slug === 'demo') {
      return sb.respond(403, { error: 'The demo account cannot be deleted' });
    }

    var orgId = org.id;

    // Delete all event data in FK order
    var events = await sb.sbGet('events?organiser_id=eq.' + orgId + '&select=id');
    for (var i = 0; i < (events || []).length; i++) {
      var eid = events[i].id;
      await sb.sbDelete('hole_scores?event_id=eq.' + eid);
      await sb.sbDelete('score_edits?event_id=eq.' + eid);
      await sb.sbDelete('send_log?event_id=eq.' + eid);
      await sb.sbDelete('payments?event_id=eq.' + eid);
      await sb.sbDelete('players?event_id=eq.' + eid);
      await sb.sbDelete('groups?event_id=eq.' + eid);
    }

    // Delete organiser-level data
    await sb.sbDelete('events?organiser_id=eq.' + orgId);
    await sb.sbDelete('people?organiser_id=eq.' + orgId);
    await sb.sbDelete('plan_events?organiser_id=eq.' + orgId);
    await sb.sbDelete('branding_versions?organiser_id=eq.' + orgId);
    // Delete the organiser row
    await sb.sbDelete('organisers?id=eq.' + orgId);

    // Delete the Supabase auth user
    await deleteAuthUser(user.id);

    return sb.respond(200, { ok: true, message: 'Account deleted' });
  } catch (err) {
    console.error('account-delete error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
