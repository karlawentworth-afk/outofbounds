'use strict';

// Send help/feedback email via Resend.
var sb = require('./shared/supabase');
var https = require('https');

/**
 * Send help/feedback email via Resend to hello@outofboundsevents.com.
 * Called from the Help sheet in organiser and player views.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  var message = (body.message || '').trim();
  if (!message) return sb.respond(400, { error: 'Message is required' });

  var from = body.from || 'A player';
  var context = body.context || '';

  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return sb.respond(500, { error: 'Email not configured' });

  var htmlBody = '<div style="font-family:sans-serif;max-width:560px;">' +
    '<h2 style="font-size:18px;color:#10344E;">Feedback from ' + escHtml(from) + '</h2>' +
    (context ? '<p style="font-size:13px;color:#5B6672;">' + escHtml(context) + '</p>' : '') +
    '<div style="background:#F7F5F0;border-radius:8px;padding:16px;margin:16px 0;font-size:15px;line-height:1.5;">' +
      escHtml(message) +
    '</div>' +
    '<p style="font-size:11px;color:#9CA3AF;">Sent from Out of Bounds Help</p>' +
  '</div>';

  try {
    await sendEmail(apiKey, {
      from: 'Out of Bounds <hello@outofboundsevents.com>',
      to: ['hello@outofboundsevents.com'],
      subject: 'Feedback from ' + from,
      html: htmlBody
    });

    return sb.respond(200, { ok: true });
  } catch (err) {
    console.error('feedback-send error:', err);
    return sb.respond(500, { error: 'Could not send feedback' });
  }
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendEmail(apiKey, params) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify(params);
    var req = https.request({
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(raw));
        } else {
          reject(new Error('Resend ' + res.statusCode + ': ' + raw));
        }
      });
    });
    var timer = setTimeout(function () { req.destroy(); reject(new Error('Resend timeout')); }, 9000);
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    req.on('close', function () { clearTimeout(timer); });
    req.write(payload);
    req.end();
  });
}
