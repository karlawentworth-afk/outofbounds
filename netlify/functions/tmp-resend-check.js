'use strict';
var https = require('https');
exports.handler = async function () {
  var key = process.env.RESEND_API_KEY || '';
  return new Promise(function (resolve) {
    var req = https.request({
      hostname: 'api.resend.com', path: '/domains', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + key }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyLength: key.length,
            keyStarts: key.substring(0, 4),
            keyEnds: key.slice(-4),
            hasStars: key.includes('*'),
            resendStatus: res.statusCode,
            resendBody: d.substring(0, 500)
          })
        });
      });
    });
    req.on('error', function (e) {
      resolve({ statusCode: 200, body: JSON.stringify({ error: e.message }) });
    });
    req.end();
  });
};
