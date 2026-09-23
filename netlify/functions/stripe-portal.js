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
      '&select=stripe_customer_id' +
      '&limit=1'
    );
    if (!orgs || !orgs.length) return sb.respond(404, { error: 'Organiser not found' });

    var customerId = orgs[0].stripe_customer_id;
    if (!customerId) return sb.respond(400, { error: 'No billing account. Subscribe first.' });

    var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';

    var session = await stripe.stripeRequest('POST', '/v1/billing_portal/sessions',
      stripe.formEncode([
        'customer=' + customerId,
        'return_url=' + encodeURIComponent(baseUrl + '/o/#billing')
      ])
    );

    return sb.respond(200, { url: session.url });
  } catch (err) {
    console.error('stripe-portal error:', err);
    return sb.respond(500, { error: err.message });
  }
};
