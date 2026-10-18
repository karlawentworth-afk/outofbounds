#!/usr/bin/env node
'use strict';

/**
 * Upload screenshots to Google Play Console via the API.
 * Uses the play-publisher service account.
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var jwt = require('jsonwebtoken');

var PACKAGE = 'com.outofboundsevents.scoring';
var SA_KEY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secrets', 'play-publisher-key.json'), 'utf8'));
var SCREENSHOT_DIR = path.join(__dirname, '..', 'docs', 'screens', 'playstore');
var SCREENS = ['events', 'setup', 'scoring', 'liveday', 'bigscreen', 'results'];

// --- Google OAuth2 ---
function getAccessToken() {
  var now = Math.floor(Date.now() / 1000);
  var token = jwt.sign({
    iss: SA_KEY.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }, SA_KEY.private_key, { algorithm: 'RS256' });

  return new Promise(function (resolve, reject) {
    var body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + token;
    var req = https.request({
      hostname: 'oauth2.googleapis.com', port: 443, path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        var data = JSON.parse(Buffer.concat(c).toString());
        if (data.access_token) resolve(data.access_token);
        else reject(new Error('OAuth failed: ' + JSON.stringify(data)));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Play API helpers ---
function playApi(accessToken, method, apiPath, body, contentType) {
  return new Promise(function (resolve, reject) {
    var headers = { 'Authorization': 'Bearer ' + accessToken };
    var payload = null;
    if (body && contentType === 'image/png') {
      headers['Content-Type'] = 'image/png';
      payload = body;
      headers['Content-Length'] = payload.length;
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = Buffer.from(JSON.stringify(body));
      headers['Content-Length'] = payload.length;
    }

    var req = https.request({
      hostname: 'androidpublisher.googleapis.com', port: 443,
      path: apiPath, method: method, headers: headers
    }, function (res) {
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(raw ? JSON.parse(raw) : {});
        } else {
          reject(new Error('Play API ' + res.statusCode + ' ' + method + ' ' + apiPath + ': ' + raw.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Upload to the upload endpoint (different hostname)
function playUpload(accessToken, apiPath, imageData) {
  return new Promise(function (resolve, reject) {
    var headers = {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'image/png',
      'Content-Length': imageData.length
    };

    var req = https.request({
      hostname: 'androidpublisher.googleapis.com', port: 443,
      path: apiPath, method: 'POST', headers: headers
    }, function (res) {
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(raw ? JSON.parse(raw) : {});
        } else {
          reject(new Error('Upload ' + res.statusCode + ': ' + raw.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.write(imageData);
    req.end();
  });
}

async function main() {
  console.log('=== Play Store Screenshot Upload ===\n');

  var accessToken = await getAccessToken();
  console.log('Authenticated as', SA_KEY.client_email);

  var basePath = '/androidpublisher/v3/applications/' + PACKAGE;

  // Create an edit
  var edit = await playApi(accessToken, 'POST', basePath + '/edits', {});
  var editId = edit.id;
  console.log('Edit created:', editId);

  // Delete existing screenshots
  console.log('Clearing existing phoneScreenshots...');
  try {
    await playApi(accessToken, 'DELETE', basePath + '/edits/' + editId + '/listings/en-GB/phoneScreenshots');
  } catch (e) {
    console.log('  (none to clear)');
  }

  // Upload each screenshot
  for (var i = 0; i < SCREENS.length; i++) {
    var filePath = path.join(SCREENSHOT_DIR, SCREENS[i] + '.png');
    if (!fs.existsSync(filePath)) {
      console.log('  MISSING:', filePath);
      continue;
    }
    var imageData = fs.readFileSync(filePath);
    var uploadPath = '/upload/androidpublisher/v3/applications/' + PACKAGE +
      '/edits/' + editId + '/listings/en-GB/phoneScreenshots';
    await playUpload(accessToken, uploadPath, imageData);
    console.log('  Uploaded ' + (i + 1) + '/6: ' + SCREENS[i] + '.png');
  }

  // Commit the edit
  await playApi(accessToken, 'POST', basePath + '/edits/' + editId + ':commit', {});
  console.log('\nEdit committed. Screenshots are in the en-GB listing.');
}

main().catch(function (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
});
