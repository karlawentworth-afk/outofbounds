#!/usr/bin/env node
'use strict';

/**
 * Create Stripe product + prices for Out of Bounds Pro tier.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/stripe-setup.js
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/stripe-setup.js --test-clock
 */

var https = require('https');

var SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SECRET_KEY) {
  console.error('Set STRIPE_SECRET_KEY environment variable.');
  process.exit(1);
}

function stripePost(path, formBody) {
  return new Promise(function (resolve, reject) {
    var payload = Buffer.from(formBody);
    var opts = {
      hostname: 'api.stripe.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length
      }
    };

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var data = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error('Stripe ' + res.statusCode + ': ' + (data.error ? data.error.message : raw.slice(0, 200))));
          }
        } catch (e) {
          reject(new Error('Bad Stripe response'));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Creating Stripe product and prices for Out of Bounds Pro...\n');

  // 1. Create product
  var product = await stripePost('/v1/products', [
    'name=' + encodeURIComponent('Out of Bounds Pro'),
    'metadata[tier]=pro'
  ].join('&'));

  console.log('Product created: ' + product.id);

  // 2. Monthly price: £14.99
  var monthly = await stripePost('/v1/prices', [
    'product=' + product.id,
    'currency=gbp',
    'unit_amount=1499',
    'recurring[interval]=month'
  ].join('&'));

  console.log('Monthly price: ' + monthly.id + ' (£14.99/month)');

  // 3. Annual price: £149
  var annual = await stripePost('/v1/prices', [
    'product=' + product.id,
    'currency=gbp',
    'unit_amount=14900',
    'recurring[interval]=year'
  ].join('&'));

  console.log('Annual price:  ' + annual.id + ' (£149/year)');

  console.log('\n--- Add these to Netlify environment variables ---');
  console.log('STRIPE_PRO_MONTHLY_PRICE=' + monthly.id);
  console.log('STRIPE_PRO_ANNUAL_PRICE=' + annual.id);

  // 4. Optional: create test clock
  if (process.argv.includes('--test-clock')) {
    var now = Math.floor(Date.now() / 1000);
    var clock = await stripePost('/v1/test_helpers/test_clocks', 'frozen_time=' + now);
    console.log('\nTest clock created: ' + clock.id);
    console.log('Frozen at: ' + new Date(now * 1000).toISOString());
    console.log('\nTo use: create a customer with test_clock=' + clock.id);
    console.log('Then advance: stripe test_clocks advance ' + clock.id + ' --frozen-time <unix_ts>');
  }
}

main().catch(function (err) {
  console.error('Error:', err.message);
  process.exit(1);
});
