'use strict';

var sb = require('./shared/supabase');
var stripe = require('./shared/stripe');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id) return sb.respond(400, { error: 'Missing organiser_id' });

  try {
    var orgs = await sb.sbGet(
      'organisers?id=eq.' + body.organiser_id +
      '&select=id,plan,stripe_customer_id,stripe_subscription_id,contact_email,name' +
      '&limit=1'
    );
    if (!orgs || !orgs.length) return sb.respond(404, { error: 'Organiser not found' });
    var org = orgs[0];

    // ── Cancel action ──
    if (body.action === 'cancel') {
      if (!org.stripe_subscription_id) {
        return sb.respond(400, { error: 'No active subscription' });
      }

      await stripe.stripeRequest('POST',
        '/v1/subscriptions/' + org.stripe_subscription_id,
        'cancel_at_period_end=true'
      );

      await sb.sbPatch('organisers?id=eq.' + body.organiser_id, {
        cancel_at_period_end: true
      });

      await sb.sbPost('plan_events', {
        organiser_id: body.organiser_id,
        event_type: 'cancel',
        old_plan: 'pro',
        new_plan: 'pro',
        stripe_subscription_id: org.stripe_subscription_id
      });

      return sb.respond(200, { ok: true, cancel_at_period_end: true });
    }

    // ── Resume (undo cancel) ──
    if (body.action === 'resume') {
      if (!org.stripe_subscription_id) {
        return sb.respond(400, { error: 'No active subscription' });
      }

      await stripe.stripeRequest('POST',
        '/v1/subscriptions/' + org.stripe_subscription_id,
        'cancel_at_period_end=false'
      );

      await sb.sbPatch('organisers?id=eq.' + body.organiser_id, {
        cancel_at_period_end: false
      });

      return sb.respond(200, { ok: true, cancel_at_period_end: false });
    }

    // ── Subscribe (create Checkout Session) ──
    var interval = body.price_interval === 'year' ? 'year' : 'month';
    var priceId = interval === 'year'
      ? process.env.STRIPE_PRO_ANNUAL_PRICE
      : process.env.STRIPE_PRO_MONTHLY_PRICE;

    if (!priceId) return sb.respond(500, { error: 'Price not configured for interval: ' + interval });

    // Create Stripe customer if needed
    var customerId = org.stripe_customer_id;
    if (!customerId) {
      var customer = await stripe.stripeRequest('POST', '/v1/customers',
        stripe.formEncode([
          'email=' + encodeURIComponent(org.contact_email || ''),
          'name=' + encodeURIComponent(org.name || ''),
          'metadata[organiser_id]=' + encodeURIComponent(body.organiser_id)
        ])
      );
      customerId = customer.id;
      await sb.sbPatch('organisers?id=eq.' + body.organiser_id, {
        stripe_customer_id: customerId
      });
    }

    var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';

    var session = await stripe.stripeRequest('POST', '/v1/checkout/sessions',
      stripe.formEncode([
        'mode=subscription',
        'customer=' + customerId,
        'line_items[0][price]=' + priceId,
        'line_items[0][quantity]=1',
        'success_url=' + encodeURIComponent(baseUrl + '/o/#billing?upgraded=true'),
        'cancel_url=' + encodeURIComponent(baseUrl + '/o/#billing'),
        'metadata[organiser_id]=' + encodeURIComponent(body.organiser_id),
        'subscription_data[metadata][organiser_id]=' + encodeURIComponent(body.organiser_id)
      ])
    );

    return sb.respond(200, { url: session.url });
  } catch (err) {
    console.error('stripe-subscribe error:', err);
    return sb.respond(500, { error: err.message });
  }
};
