// Temporary migration function — remove after use
'use strict';
var https = require('https');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };

  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: 'No key' }) };

  // Use Supabase's SQL endpoint (available on newer versions)
  // Fallback: add the column by inserting a row with the field and catching the error
  try {
    // Try to read the column first
    var rows = await sbGet('organisers?select=first_name&limit=1');
    return { statusCode: 200, body: JSON.stringify({ status: 'column already exists', sample: rows }) };
  } catch (err) {
    if (err.message.indexOf('first_name') !== -1) {
      // Column doesn't exist — we can't add it via REST API
      return { statusCode: 200, body: JSON.stringify({ status: 'column missing, run: ALTER TABLE organisers ADD COLUMN IF NOT EXISTS first_name text;' }) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function sbGet(path) {
  var key = process.env.SUPABASE_SERVICE_KEY;
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: 'ahutmswadskdkqhnrhhh.supabase.co', port: 443,
      path: '/rest/v1/' + path, method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    };
    var req = https.request(opts, function (res) {
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) reject(new Error(raw));
        else { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
