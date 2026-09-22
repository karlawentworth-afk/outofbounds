'use strict';

var sb = require('./shared/supabase');
var crypto = require('crypto');

/**
 * Verify Stripe webhook signature.
 */
function verifySignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  var parts = {};
  sigHeader.split(',').forEach(function (item) {
    var kv = item.split('=');
    if (kv[0] === 't') parts.t = kv[1];
    if (kv[0] === 'v1' && !parts.v1) parts.v1 = kv[1];
  });

  if (!parts.t || !parts.v1) return false;

  var signedPayload = parts.t + '.' + payload;
  var expected = crypto.createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1)
  );
}

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not set — rejecting all webhooks');
    return sb.respond(400, { error: 'Webhook not configured' });
  }

  var sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  var rawBody = event.body || '';

  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    console.error('Webhook signature verification failed');
    return sb.respond(400, { error: 'Invalid signature' });
  }

  var payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  if (payload.type !== 'checkout.session.completed') {
    // Acknowledge but ignore other event types
    return sb.respond(200, { received: true });
  }

  var session = payload.data && payload.data.object;
  if (!session) {
    return sb.respond(400, { error: 'Missing session data' });
  }

  var eventId = session.metadata && session.metadata.event_id;
  var organiserId = session.metadata && session.metadata.organiser_id;
  var playerCount = session.metadata && session.metadata.player_count;

  if (!eventId) {
    console.error('Webhook missing event_id in metadata');
    return sb.respond(400, { error: 'Missing event_id' });
  }

  try {
    // Mark event as paid and live
    await sb.sbPatch('events?id=eq.' + eventId, {
      paid: true,
      paid_at: new Date().toISOString(),
      status: 'live',
      stripe_payment_intent: session.payment_intent || null
    });

    // Update payment log
    await sb.sbPatch(
      'payments?stripe_checkout_id=eq.' + encodeURIComponent(session.id),
      {
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent: session.payment_intent || null
      }
    );

    // Generate tokens for any players who don't have one
    var players = await sb.sbGet(
      'players?event_id=eq.' + eventId + '&select=id,player_token'
    );

    if (players && players.length > 0) {
      for (var i = 0; i < players.length; i++) {
        if (!players[i].player_token) {
          await sb.sbPatch('players?id=eq.' + players[i].id, {
            player_token: genToken()
          });
        }
      }
    }

    console.log('Webhook processed: event ' + eventId + ' is now live');
    return sb.respond(200, { received: true });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return sb.respond(500, { error: err.message });
  }
};
