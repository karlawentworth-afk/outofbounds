'use strict';

var sb = require('./shared/supabase');
var https = require('https');

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

  var action = body.action;

  if (action === 'check') {
    // Verify token, look up organiser row
    if (!body.auth_token) {
      return sb.respond(400, { error: 'Missing auth_token' });
    }

    try {
      var user = await verifyAuthToken(body.auth_token);
      if (!user || !user.id) {
        return sb.respond(401, { error: 'Invalid or expired token' });
      }

      var orgs = await sb.sbGet(
        'organisers?auth_user_id=eq.' + user.id +
        '&select=id,name,slug,onboard_type,plan,logo_url' +
        '&limit=1'
      );

      if (orgs && orgs.length > 0) {
        return sb.respond(200, { organiser: orgs[0], user_id: user.id, email: user.email });
      } else {
        return sb.respond(200, { organiser: null, user_id: user.id, email: user.email });
      }
    } catch (err) {
      console.error('org-auth check error:', err);
      return sb.respond(500, { error: err.message || 'Internal error' });
    }

  } else if (action === 'onboard') {
    if (!body.auth_token) {
      return sb.respond(400, { error: 'Missing auth_token' });
    }
    if (!body.display_name || !body.display_name.trim()) {
      return sb.respond(400, { error: 'Missing display_name' });
    }
    var validTypes = ['friends_societies', 'charity_days', 'club_competitions', 'events_company'];
    if (!body.onboard_type || validTypes.indexOf(body.onboard_type) === -1) {
      return sb.respond(400, { error: 'Invalid onboard_type' });
    }

    try {
      var user = await verifyAuthToken(body.auth_token);
      if (!user || !user.id) {
        return sb.respond(401, { error: 'Invalid or expired token' });
      }

      // Check if already onboarded
      var existing = await sb.sbGet(
        'organisers?auth_user_id=eq.' + user.id +
        '&select=id&limit=1'
      );
      if (existing && existing.length > 0) {
        return sb.respond(200, { organiser: existing[0] });
      }

      // Generate a slug from display name
      var slug = body.display_name.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 40);
      slug = slug + '-' + Date.now().toString(36);

      var row = {
        slug: slug,
        name: body.display_name.trim(),
        auth_user_id: user.id,
        onboard_type: body.onboard_type,
        contact_email: user.email || null,
        plan: 'per_event'
      };

      var created = await sb.sbPost('organisers', row);
      var org = Array.isArray(created) ? created[0] : created;

      return sb.respond(200, { organiser: org });
    } catch (err) {
      console.error('org-auth onboard error:', err);
      return sb.respond(500, { error: err.message || 'Internal error' });
    }

  } else {
    return sb.respond(400, { error: 'Unknown action: ' + action });
  }
};
