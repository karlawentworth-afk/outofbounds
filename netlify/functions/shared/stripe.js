'use strict';

var https = require('https');

/**
 * Raw HTTPS request to the Stripe API.
 * @param {string} method  - GET, POST, DELETE
 * @param {string} path    - e.g. '/v1/checkout/sessions'
 * @param {string|null} formBody - URL-encoded form body (or null for GET)
 * @returns {Promise<object>} parsed JSON response
 */
function stripeRequest(method, path, formBody) {
  var secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return Promise.reject(new Error('STRIPE_SECRET_KEY not set'));

  return new Promise(function (resolve, reject) {
    var payload = formBody ? Buffer.from(formBody) : null;

    var headers = {
      'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (payload) headers['Content-Length'] = payload.length;

    var opts = {
      hostname: 'api.stripe.com',
      port: 443,
      path: path,
      method: method,
      headers: headers
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
            reject(new Error('Stripe ' + res.statusCode + ': ' + (data.error ? data.error.message : raw.slice(0, 200))));
          }
        } catch (e) {
          reject(new Error('Bad response from Stripe: ' + raw.slice(0, 200)));
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Build a URL-encoded form body from an array of 'key=value' strings.
 */
function formEncode(lines) {
  return lines.join('&');
}

module.exports = { stripeRequest: stripeRequest, formEncode: formEncode };
