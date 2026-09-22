// Generate Apple Sign-In client secret for Supabase
// Usage: node scripts/generate-apple-secret.js
//
// This secret expires 180 days from generation.
// Regenerate before expiry by running this script again
// and pasting the output into Supabase > Authentication >
// Providers > Apple > Secret Key.

var jwt = require('jsonwebtoken');
var fs = require('fs');
var path = require('path');

var KEY_ID     = '55KL45AR6V';
var TEAM_ID    = '69UCJQNR64';
var SERVICES_ID = 'BBJ4DP7AV3';
var KEY_FILE   = path.join(__dirname, '..', 'AuthKey_BBJ4DP7AV3.p8');

var privateKey = fs.readFileSync(KEY_FILE, 'utf8');

var now = Math.floor(Date.now() / 1000);
var expiry = 180 * 24 * 60 * 60; // 180 days in seconds

var token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  issuer: TEAM_ID,
  audience: 'https://appleid.apple.com',
  subject: SERVICES_ID,
  expiresIn: expiry,
  header: {
    alg: 'ES256',
    kid: KEY_ID
  }
});

var expiryDate = new Date((now + expiry) * 1000);
console.log('');
console.log('Apple client secret (paste into Supabase):');
console.log('');
console.log(token);
console.log('');
console.log('Expires: ' + expiryDate.toISOString().split('T')[0]);
console.log('');
