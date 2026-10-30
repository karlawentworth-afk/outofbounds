'use strict';

var https = require('https');

var PROD_URL  = 'https://outofboundsevents.com';
var SB_HOST   = 'ahutmswadskdkqhnrhhh.supabase.co';
var SB_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';

// Only allow origins that belong to us
function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    var host = new URL(origin).hostname;
    return host.endsWith('outofboundsscoring.netlify.app') ||
           host.endsWith('outofboundsevents.com');
  } catch (e) { return false; }
}

function resolveOrigin(event) {
  var origin = event.headers['origin'] || event.headers['Origin'] || '';
  if (isAllowedOrigin(origin)) return origin;
  var deploy = process.env.DEPLOY_PRIME_URL || '';
  if (isAllowedOrigin(deploy)) return deploy;
  return PROD_URL;
}

function callGoTrue(path, body) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify(body);
    var req = https.request({
      hostname: SB_HOST,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'apikey': SB_ANON,
        'Authorization': 'Bearer ' + SB_ANON,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: raw });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };

  var body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad JSON' }) };
  }

  var email = (body.email || '').trim().toLowerCase();
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };

  var origin = resolveOrigin(event);
  var redirectTo = origin + '/o/';

  // Call Supabase GoTrue OTP endpoint with the anon key
  // The redirect_to goes in the query string so GoTrue uses it in the magic link
  var result = await callGoTrue(
    '/auth/v1/otp?redirect_to=' + encodeURIComponent(redirectTo),
    { email: email, create_user: true, gotrue_meta_security: {} }
  );

  return {
    statusCode: result.status < 300 ? 200 : result.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      ok: result.status < 300,
      origin: origin,
      redirectTo: redirectTo
    })
  };
};
