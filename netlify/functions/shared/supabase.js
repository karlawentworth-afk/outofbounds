'use strict';

const https = require('https');

const SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
const TIMEOUT_MS = 9000;

/**
 * Low-level Supabase REST request.
 * Returns parsed JSON body. Rejects on network error, timeout, or non-2xx.
 */
function sbRequest(method, path, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return Promise.reject(new Error('SUPABASE_SERVICE_KEY not set'));

  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;

    var headers = {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=representation'
    };

    // For upsert we need resolution=merge-duplicates
    if (method === 'POST' && path.indexOf('on_conflict') !== -1) {
      headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    }

    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    var opts = {
      hostname: SB_HOST,
      port: 443,
      path: '/rest/v1/' + path,
      method: method,
      headers: headers
    };

    var ac = new AbortController();
    var timer = setTimeout(function () {
      ac.abort();
      reject(new Error('Supabase request timed out'));
    }, TIMEOUT_MS);

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('Supabase ' + res.statusCode + ': ' + raw));
          return;
        }
        try {
          resolve(raw ? JSON.parse(raw) : null);
        } catch (e) {
          reject(new Error('Bad JSON from Supabase: ' + raw.slice(0, 200)));
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    // Wire up abort
    ac.signal.addEventListener('abort', function () {
      req.destroy();
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function sbGet(path) {
  return sbRequest('GET', path, null);
}

function sbPost(path, body) {
  return sbRequest('POST', path, body);
}

function sbPatch(path, body) {
  return sbRequest('PATCH', path, body);
}

/**
 * Standard CORS headers for every response.
 */
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Build a Netlify response object.
 */
function respond(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: CORS,
    body: JSON.stringify(body)
  };
}

module.exports = { sbGet: sbGet, sbPost: sbPost, sbPatch: sbPatch, CORS: CORS, respond: respond };
