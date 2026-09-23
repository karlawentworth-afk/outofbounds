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
    // Monthly Pro is a 12-month term. Cancel sets cancel_at = term_end
    // (start_date + 12 months), not the next billing period.
    if (body.action === 'cancel') {
      if (!org.stripe_subscription_id) {
        return sb.respond(400, { error: 'No active subscription' });
      }

      // Fetch subscription to get start_date and interval
      var sub = await stripe.stripeRequest('GET',
        '/v1/subscriptions/' + org.stripe_subscription_id, null);

      var interval = sub.items && sub.items.data[0] && sub.items.data[0].price
        ? sub.items.data[0].price.recurring.interval : 'month';

      var termEndUnix;
      if (interval === 'year') {
        // Annual: cancel at end of current period
        var pe = sub.items && sub.items.data[0] ? sub.items.data[0].current_period_end : null;
        termEndUnix = pe || (sub.start_date + 365 * 86400);
      } else {
        // Monthly: 12-month term from start_date
        var startDate = new Date(sub.start_date * 1000);
        startDate.setFullYear(startDate.getFullYear() + 1);
        termEndUnix = Math.floor(startDate.getTime() / 1000);
      }

      // Set cancel_at to the term end (not cancel_at_period_end)
      await stripe.stripeRequest('POST',
        '/v1/subscriptions/' + org.stripe_subscription_id,
        'cancel_at=' + termEndUnix
      );

      var termEndISO = new Date(termEndUnix * 1000).toISOString();

      await sb.sbPatch('organisers?id=eq.' + body.organiser_id, {
        cancel_at_period_end: true,
        current_period_end: termEndISO
      });

      await sb.sbPost('plan_events', {
        organiser_id: body.organiser_id,
        event_type: 'cancel',
        old_plan: 'pro',
        new_plan: 'pro',
        stripe_subscription_id: org.stripe_subscription_id
      });

      return sb.respond(200, { ok: true, cancel_at: termEndISO });
    }

    // ── Resume (undo cancel) ──
    if (body.action === 'resume') {
      if (!org.stripe_subscription_id) {
        return sb.respond(400, { error: 'No active subscription' });
      }

      // Clear cancel_at
      await stripe.stripeRequest('POST',
        '/v1/subscriptions/' + org.stripe_subscription_id,
        stripe.formEncode(['cancel_at=', 'cancel_at_period_end=false'])
      );

      await sb.sbPatch('organisers?id=eq.' + body.organiser_id, {
        cancel_at_period_end: false
      });

      return sb.respond(200, { ok: true, cancel_at_period_end: false });
    }

    // ── Subscribe (create Checkout Session) ──
    var interval = body.price_interval === 'year' ? 'year' : 'month';
    var priceId = interval === 'year'
      ? process.env.STRIPE_PRICE_PRO_ANNUAL
      : process.env.STRIPE_PRICE_PRO_MONTHLY;

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
