'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

/**
 * Verify Resend webhook signature.
 * Resend signs with HMAC-SHA256: base64(hmac(secret, svix_id.svix_timestamp.body))
 */
function verifyResendSignature(body, headers, secret) {
  if (!secret) return false;

  var svixId = headers['svix-id'];
  var svixTimestamp = headers['svix-timestamp'];
  var svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Decode the secret (Resend prefixes with "whsec_")
  var secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  var toSign = svixId + '.' + svixTimestamp + '.' + body;
  var expected = crypto.createHmac('sha256', secretBytes)
    .update(toSign)
    .digest('base64');

  // svix-signature can have multiple sigs: "v1,<base64> v1,<base64>"
  var sigs = svixSignature.split(' ');
  for (var i = 0; i < sigs.length; i++) {
    var parts = sigs[i].split(',');
    if (parts.length === 2 && parts[1] === expected) return true;
  }

  return false;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('resend-webhook: RESEND_WEBHOOK_SECRET not set');
    return sb.respond(400, { error: 'Webhook not configured' });
  }

  var rawBody = event.body || '';
  var headers = event.headers || {};

  if (!verifyResendSignature(rawBody, headers, secret)) {
    console.error('Resend webhook signature verification failed');
    return sb.respond(400, { error: 'Invalid signature' });
  }

  var payload;
  try { payload = JSON.parse(rawBody); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  var eventType = payload.type;
  var data = payload.data;

  if (!data) return sb.respond(200, { received: true });

  try {
    // Resend event types we care about
    if (eventType === 'email.delivered') {
      if (data.email_id) {
        await sb.sbPatch(
          'send_log?resend_id=eq.' + encodeURIComponent(data.email_id),
          { status: 'delivered' }
        );
        console.log('Resend delivered: ' + data.email_id);
      }
    } else if (eventType === 'email.bounced') {
      if (data.email_id) {
        await sb.sbPatch(
          'send_log?resend_id=eq.' + encodeURIComponent(data.email_id),
          { status: 'bounced' }
        );
        console.log('Resend bounced: ' + data.email_id);
      }
    }

    return sb.respond(200, { received: true });
  } catch (err) {
    console.error('resend-webhook error:', err);
    return sb.respond(500, { error: err.message });
  }
};
