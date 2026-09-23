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

  var expectedBuf = Buffer.from(expected);
  var actualBuf = Buffer.from(parts.v1);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Per-event payment handler (existing logic) ──────────────────

async function handleEventPayment(session) {
  var eventId = session.metadata && session.metadata.event_id;
  var organiserId = session.metadata && session.metadata.organiser_id;

  if (!eventId) {
    console.error('Webhook missing event_id in metadata');
    return sb.respond(400, { error: 'Missing event_id' });
  }

  // Top-up payments: just log, don't change event status
  var isTopUp = session.metadata && session.metadata.top_up === 'true';
  if (isTopUp) {
    await sb.sbPatch(
      'payments?stripe_checkout_id=eq.' + encodeURIComponent(session.id),
      { status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: session.payment_intent || null }
    );
    console.log('Top-up payment logged for event ' + eventId);
    return sb.respond(200, { received: true });
  }

  // Verify amount matches what we expect
  var expectedAmount = session.metadata && session.metadata.expected_amount;
  var actualAmount = session.amount_total;
  if (expectedAmount && actualAmount && parseInt(expectedAmount) !== actualAmount) {
    console.error('Webhook amount mismatch: expected ' + expectedAmount + ', got ' + actualAmount + ' for event ' + eventId);
    try {
      await sb.sbPatch(
        'payments?stripe_checkout_id=eq.' + encodeURIComponent(session.id),
        { status: 'amount_mismatch' }
      );
    } catch (e) {}
    return sb.respond(200, { received: true, applied: false, reason: 'amount_mismatch' });
  }

  // Verify the event exists and belongs to the organiser
  var evCheck = await sb.sbGet(
    'events?id=eq.' + eventId + '&select=id,organiser_id,paid&limit=1'
  );
  if (!evCheck || !evCheck.length) {
    console.error('Webhook: event ' + eventId + ' not found');
    return sb.respond(200, { received: true, applied: false, reason: 'event_not_found' });
  }
  if (organiserId && evCheck[0].organiser_id !== organiserId) {
    console.error('Webhook: organiser mismatch for event ' + eventId);
    return sb.respond(200, { received: true, applied: false, reason: 'organiser_mismatch' });
  }

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
}

// ── Subscription handlers ───────────────────────────────────────

async function handleSubscriptionCheckout(session) {
  var organiserId = session.metadata && session.metadata.organiser_id;
  if (!organiserId) {
    console.error('Subscription webhook missing organiser_id');
    return sb.respond(200, { received: true, applied: false });
  }

  var subscriptionId = session.subscription;
  if (!subscriptionId) {
    console.error('Subscription webhook missing subscription ID');
    return sb.respond(200, { received: true, applied: false });
  }

  // Fetch subscription details from Stripe for current_period_end
  var stripe = require('./shared/stripe');
  var sub = await stripe.stripeRequest('GET', '/v1/subscriptions/' + subscriptionId, null);

  var periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  // Get current plan for audit log
  var orgs = await sb.sbGet('organisers?id=eq.' + organiserId + '&select=plan&limit=1');
  var oldPlan = (orgs && orgs[0]) ? orgs[0].plan : 'per_event';

  await sb.sbPatch('organisers?id=eq.' + organiserId, {
    plan: 'pro',
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status || 'active',
    current_period_end: periodEnd,
    cancel_at_period_end: false
  });

  await sb.sbPost('plan_events', {
    organiser_id: organiserId,
    event_type: 'upgrade',
    old_plan: oldPlan,
    new_plan: 'pro',
    stripe_subscription_id: subscriptionId
  });

  console.log('Subscription created for organiser ' + organiserId);
  return sb.respond(200, { received: true });
}

async function handleSubscriptionUpdated(sub) {
  var organiserId = sub.metadata && sub.metadata.organiser_id;
  if (!organiserId) {
    console.error('subscription.updated missing organiser_id in metadata');
    return sb.respond(200, { received: true, applied: false });
  }

  var periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  var update = {
    subscription_status: sub.status,
    current_period_end: periodEnd,
    cancel_at_period_end: !!sub.cancel_at_period_end
  };

  await sb.sbPatch('organisers?id=eq.' + organiserId, update);

  // Log cancel if cancel_at_period_end just turned on
  if (sub.cancel_at_period_end && sub.previous_attributes && !sub.previous_attributes.cancel_at_period_end) {
    await sb.sbPost('plan_events', {
      organiser_id: organiserId,
      event_type: 'cancel',
      old_plan: 'pro',
      new_plan: 'pro',
      stripe_subscription_id: sub.id
    });
  }

  console.log('Subscription updated for organiser ' + organiserId + ' status=' + sub.status);
  return sb.respond(200, { received: true });
}

async function handleSubscriptionDeleted(sub) {
  var organiserId = sub.metadata && sub.metadata.organiser_id;
  if (!organiserId) {
    console.error('subscription.deleted missing organiser_id in metadata');
    return sb.respond(200, { received: true, applied: false });
  }

  await sb.sbPatch('organisers?id=eq.' + organiserId, {
    plan: 'per_event',
    stripe_subscription_id: null,
    subscription_status: 'canceled',
    current_period_end: null,
    cancel_at_period_end: false
  });

  await sb.sbPost('plan_events', {
    organiser_id: organiserId,
    event_type: 'lapse',
    old_plan: 'pro',
    new_plan: 'per_event',
    stripe_subscription_id: sub.id
  });

  console.log('Subscription deleted (lapse) for organiser ' + organiserId);
  return sb.respond(200, { received: true });
}

async function handleInvoiceFailed(invoice) {
  // Try to find the organiser from subscription metadata
  var subId = invoice.subscription;
  if (!subId) return sb.respond(200, { received: true });

  var stripe = require('./shared/stripe');
  try {
    var sub = await stripe.stripeRequest('GET', '/v1/subscriptions/' + subId, null);
    var organiserId = sub.metadata && sub.metadata.organiser_id;
    if (organiserId) {
      await sb.sbPatch('organisers?id=eq.' + organiserId, {
        subscription_status: 'past_due'
      });
      console.log('Invoice failed for organiser ' + organiserId + ', marked past_due');
    }
  } catch (err) {
    console.error('invoice.payment_failed handler error:', err.message);
  }

  return sb.respond(200, { received: true });
}

// ── Main handler ────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

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
  try { payload = JSON.parse(rawBody); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  var obj = payload.data && payload.data.object;
  if (!obj) return sb.respond(400, { error: 'Missing event data' });

  try {
    switch (payload.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription') {
          return await handleSubscriptionCheckout(obj);
        }
        return await handleEventPayment(obj);

      case 'customer.subscription.updated':
        return await handleSubscriptionUpdated(obj);

      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(obj);

      case 'invoice.payment_failed':
        return await handleInvoiceFailed(obj);

      default:
        return sb.respond(200, { received: true });
    }
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return sb.respond(500, { error: err.message });
  }
};
