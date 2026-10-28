'use strict';

var https = require('https');
var sb = require('./shared/supabase');

var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';

/**
 * Extract Bearer token from the Authorization header.
 */
function extractToken(event) {
  var hdr = (event.headers || {}).authorization || (event.headers || {}).Authorization || '';
  if (hdr.indexOf('Bearer ') === 0) return hdr.slice(7);
  return null;
}

/**
 * Verify a Supabase Auth JWT by calling /auth/v1/user.
 * Returns the user object or null.
 */
function verifyJWT(token) {
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
 * requireUser(event) — verifies the bearer JWT.
 * Returns { user_id, email } or throws { status: 401 }.
 */
async function requireUser(event) {
  var token = extractToken(event);
  if (!token) {
    var err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    throw err;
  }

  var user = await verifyJWT(token);
  if (!user || !user.id) {
    var err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }

  return { user_id: user.id, email: user.email };
}

/**
 * requireOrgMember(event, organiser_id) — requireUser then checks
 * the caller owns or is a member of the organisation.
 * Returns { user, role } or throws 401/403.
 */
async function requireOrgMember(event, organiserId) {
  var user = await requireUser(event);

  // Check if the user is the org owner (auth_user_id on the organisers row)
  var orgs = await sb.sbGet(
    'organisers?id=eq.' + organiserId +
    '&auth_user_id=eq.' + user.user_id +
    '&select=id' +
    '&limit=1'
  );

  if (orgs && orgs.length > 0) {
    return { user: user, role: 'owner' };
  }

  // Check organiser_users for accepted team members (matched by email)
  var members = user.email ? await sb.sbGet(
    'organiser_users?organiser_id=eq.' + organiserId +
    '&email=eq.' + encodeURIComponent(user.email.toLowerCase()) +
    '&revoked_at=is.null&accepted_at=not.is.null' +
    '&select=role' +
    '&limit=1'
  ) : [];

  if (members && members.length > 0) {
    return { user: user, role: members[0].role };
  }

  var err = new Error('Not a member of this organisation');
  err.status = 403;
  throw err;
}

/**
 * requireEventOwner(event, event_id) — loads the event, derives
 * its organiser_id, calls requireOrgMember.
 * Returns { user, role, event } or throws 401/403/404.
 */
async function requireEventOwner(event, eventId) {
  var user = await requireUser(event);

  var rows = await sb.sbGet(
    'events?id=eq.' + eventId +
    '&select=id,organiser_id,status,name' +
    '&limit=1'
  );

  if (!rows || rows.length === 0) {
    var err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  var ev = rows[0];

  // Re-use requireOrgMember but pass the already-verified user through
  // by constructing a fake event with the token
  var memberResult = await requireOrgMember(event, ev.organiser_id);

  return { user: memberResult.user, role: memberResult.role, event: ev };
}

/**
 * requireSuperadmin(event) — requireUser then checks is_superadmin.
 * Returns { user, organiser } or throws 401/403.
 */
async function requireSuperadmin(event) {
  var user = await requireUser(event);

  var orgs = await sb.sbGet(
    'organisers?auth_user_id=eq.' + user.user_id +
    '&select=id,is_superadmin' +
    '&limit=1'
  );

  if (!orgs || !orgs.length || !orgs[0].is_superadmin) {
    var err = new Error('Not authorised');
    err.status = 403;
    throw err;
  }

  return { user: user, organiser: orgs[0] };
}

/**
 * Wrap a handler error into a respond() call.
 */
function authError(err) {
  var status = err.status || 500;
  return sb.respond(status, { error: err.message || 'Auth error' });
}

module.exports = {
  requireUser: requireUser,
  requireOrgMember: requireOrgMember,
  requireEventOwner: requireEventOwner,
  requireSuperadmin: requireSuperadmin,
  authError: authError,
  extractToken: extractToken
};
