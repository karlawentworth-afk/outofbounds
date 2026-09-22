'use strict';

var sb = require('./shared/supabase');
var https = require('https');

/**
 * Create a Stripe Checkout session via the Stripe API.
 */
function createCheckoutSession(params) {
  var secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return Promise.reject(new Error('STRIPE_SECRET_KEY not set'));

  return new Promise(function (resolve, reject) {
    var formData = [
      'mode=payment',
      'line_items[0][price_data][currency]=gbp',
      'line_items[0][price_data][product_data][name]=' + encodeURIComponent('Out of Bounds — Live Scoring'),
      'line_items[0][price_data][product_data][description]=' + encodeURIComponent(params.description),
      'line_items[0][price_data][unit_amount]=' + params.amount_pence,
      'line_items[0][quantity]=1',
      'success_url=' + encodeURIComponent(params.success_url),
      'cancel_url=' + encodeURIComponent(params.cancel_url),
      'metadata[event_id]=' + encodeURIComponent(params.event_id),
      'metadata[organiser_id]=' + encodeURIComponent(params.organiser_id),
      'metadata[player_count]=' + params.player_count
    ].join('&');

    var payload = Buffer.from(formData);

    var opts = {
      hostname: 'api.stripe.com',
      port: 443,
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length
      }
    };

    var timer = setTimeout(function () {
      reject(new Error('Stripe request timed out'));
    }, 9000);

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        try {
          var data = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error('Stripe error: ' + (data.error ? data.error.message : raw)));
          }
        } catch (e) {
          reject(new Error('Bad response from Stripe'));
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  if (!body.event_id || !body.organiser_id) {
    return sb.respond(400, { error: 'Missing event_id or organiser_id' });
  }

  try {
    // Verify ownership
    var events = await sb.sbGet(
      'events?id=eq.' + body.event_id +
      '&organiser_id=eq.' + body.organiser_id +
      '&select=id,name,status,paid' +
      '&limit=1'
    );

    if (!events || !events.length) {
      return sb.respond(403, { error: 'Event not found or not yours' });
    }

    var ev = events[0];

    if (ev.paid) {
      return sb.respond(400, { error: 'Event already paid' });
    }

    // Count players
    var players = await sb.sbGet(
      'players?event_id=eq.' + body.event_id + '&select=id'
    );
    var playerCount = players ? players.length : 0;

    if (playerCount === 0) {
      return sb.respond(400, { error: 'No players in event' });
    }

    // Calculate price: 999 base + 99 per player (in pence)
    var amountPence = 999 + (playerCount * 99);

    var baseUrl = process.env.APP_BASE_URL || 'https://oob.golf';
    var successUrl = baseUrl + '/o/#dashboard?paid=true';
    var cancelUrl = baseUrl + '/o/#event-' + body.event_id;

    var description = ev.name + ' — ' + playerCount + ' player' + (playerCount !== 1 ? 's' : '');

    var session = await createCheckoutSession({
      amount_pence: amountPence,
      description: description,
      success_url: successUrl,
      cancel_url: cancelUrl,
      event_id: body.event_id,
      organiser_id: body.organiser_id,
      player_count: playerCount
    });

    // Store checkout ID on event
    await sb.sbPatch('events?id=eq.' + body.event_id, {
      stripe_checkout_id: session.id,
      player_count_at_payment: playerCount,
      paid_amount_pence: amountPence
    });

    // Create payment log
    await sb.sbPost('payments', {
      organiser_id: body.organiser_id,
      event_id: body.event_id,
      stripe_checkout_id: session.id,
      amount_pence: amountPence,
      player_count: playerCount,
      status: 'pending'
    });

    return sb.respond(200, { url: session.url });
  } catch (err) {
    console.error('stripe-checkout error:', err);
    return sb.respond(500, { error: err.message });
  }
};
