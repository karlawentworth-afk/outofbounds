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
    var lines = [
      'mode=payment',
      'success_url=' + encodeURIComponent(params.success_url),
      'cancel_url=' + encodeURIComponent(params.cancel_url),
      'metadata[event_id]=' + encodeURIComponent(params.event_id),
      'metadata[organiser_id]=' + encodeURIComponent(params.organiser_id),
      'metadata[player_count]=' + params.player_count,
      'metadata[expected_amount]=' + params.amount_pence
    ];

    if (params.top_up) {
      // Single line item for top-up
      lines.push('line_items[0][price_data][currency]=gbp');
      lines.push('line_items[0][price_data][product_data][name]=' + encodeURIComponent('Additional player'));
      lines.push('line_items[0][price_data][unit_amount]=99');
      lines.push('line_items[0][quantity]=1');
      lines.push('metadata[top_up]=true');
    } else {
      // Two line items for readable receipt:
      // 1. "Out of Bounds event fee" £9.99 x1
      // 2. "Players" £0.99 x player_count
      lines.push('line_items[0][price_data][currency]=gbp');
      lines.push('line_items[0][price_data][product_data][name]=' + encodeURIComponent('Out of Bounds event fee'));
      lines.push('line_items[0][price_data][unit_amount]=999');
      lines.push('line_items[0][quantity]=1');
      lines.push('line_items[1][price_data][currency]=gbp');
      lines.push('line_items[1][price_data][product_data][name]=' + encodeURIComponent('Players'));
      lines.push('line_items[1][price_data][product_data][description]=' + encodeURIComponent(params.event_name || ''));
      lines.push('line_items[1][price_data][unit_amount]=99');
      lines.push('line_items[1][quantity]=' + params.player_count);
    }

    var formData = lines.join('&');

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

    if (ev.paid && !body.top_up) {
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

    // Top-up: 99p for one additional player after go-live
    if (body.top_up) {
      if (!ev.paid || ev.status !== 'live') {
        return sb.respond(400, { error: 'Top-up only available for paid, live events' });
      }

      var topUpSession = await createCheckoutSession({
        amount_pence: 99,
        event_name: ev.name,
        success_url: successUrl,
        cancel_url: cancelUrl,
        event_id: body.event_id,
        organiser_id: body.organiser_id,
        player_count: 1,
        top_up: true
      });

      await sb.sbPost('payments', {
        organiser_id: body.organiser_id,
        event_id: body.event_id,
        stripe_checkout_id: topUpSession.id,
        amount_pence: 99,
        player_count: 1,
        status: 'pending'
      });

      return sb.respond(200, { url: topUpSession.url });
    }

    var session = await createCheckoutSession({
      amount_pence: amountPence,
      event_name: ev.name,
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
