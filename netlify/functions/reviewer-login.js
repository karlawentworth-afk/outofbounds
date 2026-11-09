'use strict';

var sb = require('./shared/supabase');
var https = require('https');

var SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';

/**
 * Admin API request to Supabase Auth (GoTrue).
 * Uses SUPABASE_SERVICE_KEY for admin access.
 */
function authAdmin(method, path, body) {
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return Promise.reject(new Error('SUPABASE_SERVICE_KEY not set'));

  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : null;
    var headers = {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var opts = {
      hostname: SB_HOST,
      port: 443,
      path: '/auth/v1' + path,
      method: method,
      headers: headers
    };

    var timer = setTimeout(function () {
      reject(new Error('Auth admin request timed out'));
    }, 9000);

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          reject(new Error('Bad JSON: ' + raw.slice(0, 200)));
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Reviewer sign-in for App Store review.
 *
 * POST { email: "review@outofboundsevents.com", code: "123456" }
 *
 * Only works when REVIEWER_CODE is set in Netlify env vars.
 * Signs in as the demo organiser (Fairway Events) so the reviewer
 * sees real event data.
 *
 * Rate-limited: 5 attempts per IP per 15 minutes.
 */

// In-memory rate limit (resets when function cold-starts, which is fine)
var attempts = {};
var RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
var RATE_LIMIT = 5;

function checkRate(ip) {
  var now = Date.now();
  if (!attempts[ip]) attempts[ip] = [];
  // Remove expired entries
  attempts[ip] = attempts[ip].filter(function (t) { return now - t < RATE_WINDOW; });
  if (attempts[ip].length >= RATE_LIMIT) return false;
  attempts[ip].push(now);
  return true;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var reviewerCode = process.env.REVIEWER_CODE;
  if (!reviewerCode) {
    return sb.respond(403, { error: 'Reviewer access is not enabled' });
  }

  // Rate limit
  var ip = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim();
  if (!checkRate(ip)) {
    return sb.respond(429, { error: 'Too many attempts. Try again in 15 minutes.' });
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  var email = (body.email || '').trim().toLowerCase();
  if (email !== 'review@outofboundsevents.com') {
    return sb.respond(403, { error: 'Invalid credentials' });
  }
  if (!body.code || body.code !== reviewerCode) {
    return sb.respond(403, { error: 'Invalid credentials' });
  }

  var REVIEWER_EMAIL = 'review@outofboundsevents.com';

  try {
    // 1. Find the demo organiser
    var demo = await sb.sbGet(
      'organisers?slug=eq.demo&select=id,auth_user_id&limit=1'
    );
    if (!demo || !demo.length) {
      return sb.respond(500, { error: 'Demo organiser not found' });
    }

    // 2. Find or create the reviewer Supabase user
    var userRes = await authAdmin('POST', '/admin/generate_link', {
      type: 'magiclink',
      email: REVIEWER_EMAIL
    });

    var userId;
    if (userRes.status === 200 && userRes.data && userRes.data.id) {
      userId = userRes.data.id;
    } else {
      // User doesn't exist — create it
      var createRes = await authAdmin('POST', '/admin/users', {
        email: REVIEWER_EMAIL,
        email_confirm: true
      });
      if (createRes.status !== 200 || !createRes.data || !createRes.data.id) {
        return sb.respond(500, { error: 'Could not create reviewer user' });
      }
      userId = createRes.data.id;

      // Generate the link again now that user exists
      userRes = await authAdmin('POST', '/admin/generate_link', {
        type: 'magiclink',
        email: REVIEWER_EMAIL
      });
    }

    // 3. Link reviewer user to demo org if not already linked
    if (demo[0].auth_user_id !== userId) {
      await sb.sbPatch('organisers?id=eq.' + demo[0].id, {
        auth_user_id: userId
      });
    }

    // 4. Verify the magic link token to get session tokens
    if (!userRes.data || !userRes.data.hashed_token) {
      return sb.respond(500, { error: 'Could not generate sign-in link' });
    }

    var verifyRes = await authAdmin('POST', '/verify', {
      type: 'magiclink',
      token_hash: userRes.data.hashed_token
    });
    if (verifyRes.status !== 200 || !verifyRes.data || !verifyRes.data.access_token) {
      return sb.respond(500, { error: 'Could not create session' });
    }

    return sb.respond(200, {
      access_token: verifyRes.data.access_token,
      refresh_token: verifyRes.data.refresh_token
    });
  } catch (err) {
    console.error('reviewer-login error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
