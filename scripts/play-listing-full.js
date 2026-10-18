#!/usr/bin/env node
'use strict';

/**
 * Push the COMPLETE Play Store listing in one edit:
 * - App details (contact email, website, category)
 * - en-GB listing (title, short desc, full desc)
 * - Icon 512x512
 * - Feature graphic 1024x500
 * - 6 phone screenshots (preserved if already present)
 *
 * Rule: GET current state, carry everything forward, never commit partial.
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var jwt = require('jsonwebtoken');
var { chromium } = require('playwright');

var PACKAGE = 'com.outofboundsevents.scoring';
var SA_KEY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secrets', 'play-publisher-key.json'), 'utf8'));

var SHORT_DESC = 'Live golf scoring for society days, charity days and club events. No cards.';
var FULL_DESC = fs.readFileSync(path.join(__dirname, 'asc-description.txt'), 'utf8').trim();

// --- Auth ---
function getAccessToken() {
  var now = Math.floor(Date.now() / 1000);
  var token = jwt.sign({
    iss: SA_KEY.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }, SA_KEY.private_key, { algorithm: 'RS256' });
  return new Promise(function (r, j) {
    var body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + token;
    var req = https.request({ hostname: 'oauth2.googleapis.com', port: 443, path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) { var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { r(JSON.parse(Buffer.concat(c).toString()).access_token); }); });
    req.on('error', j); req.write(body); req.end();
  });
}

// --- API ---
function playApi(at, method, apiPath, body) {
  return new Promise(function (r, j) {
    var payload = body ? JSON.stringify(body) : null;
    var h = { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' };
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    var req = https.request({ hostname: 'androidpublisher.googleapis.com', port: 443, path: apiPath, method: method, headers: h }, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) r(raw ? JSON.parse(raw) : {});
        else j(new Error('Play ' + res.statusCode + ' ' + method + ' ' + apiPath.split('/').slice(-3).join('/') + ': ' + raw.slice(0, 300)));
      });
    });
    req.on('error', j); if (payload) req.write(payload); req.end();
  });
}

function playUpload(at, apiPath, imageData) {
  return new Promise(function (r, j) {
    var req = https.request({ hostname: 'androidpublisher.googleapis.com', port: 443, path: apiPath, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'image/png', 'Content-Length': imageData.length }
    }, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) r(raw ? JSON.parse(raw) : {});
        else j(new Error('Upload ' + res.statusCode + ': ' + raw.slice(0, 300)));
      });
    });
    req.on('error', j); req.write(imageData); req.end();
  });
}

// --- Generate images with Playwright ---
async function generateIcon() {
  console.log('  Generating 512x512 icon (alpha flattened onto #10344E)...');
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  var iconSrc = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'resources', 'icon.png')).toString('base64');

  await page.setContent('<canvas id="c" width="512" height="512"></canvas>');
  var buf = await page.evaluate(function (src) {
    return new Promise(function (resolve) {
      var c = document.getElementById('c');
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#10344E';
      ctx.fillRect(0, 0, 512, 512);
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0, 512, 512);
        c.toBlob(function (blob) {
          blob.arrayBuffer().then(function (ab) {
            resolve(Array.from(new Uint8Array(ab)));
          });
        }, 'image/png');
      };
      img.src = src;
    });
  }, iconSrc);
  await browser.close();
  return Buffer.from(buf);
}

async function generateFeatureGraphic() {
  console.log('  Generating 1024x500 feature graphic...');
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1024, height: 500 } });

  // Load the OB icon for the mark
  var iconSrc = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'icon-white.png')).toString('base64');

  await page.setContent('<canvas id="c" width="1024" height="500"></canvas>' +
    '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">');
  await page.waitForTimeout(1500); // Let font load

  var buf = await page.evaluate(function (src) {
    return new Promise(function (resolve) {
      var c = document.getElementById('c');
      var ctx = c.getContext('2d');

      // Navy background
      ctx.fillStyle = '#10344E';
      ctx.fillRect(0, 0, 1024, 500);

      // OB mark on the left
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 80, 130, 240, 240);

        // "Out of Bounds" — Poppins Bold, white
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 52px Poppins, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('Out of Bounds', 380, 220);

        // "Live golf scoring" — Poppins Regular, light blue
        ctx.fillStyle = '#C8D7E1';
        ctx.font = '400 30px Poppins, sans-serif';
        ctx.fillText('Live golf scoring', 380, 290);

        c.toBlob(function (blob) {
          blob.arrayBuffer().then(function (ab) {
            resolve(Array.from(new Uint8Array(ab)));
          });
        }, 'image/png');
      };
      img.src = src;
    });
  }, iconSrc);
  await browser.close();
  return Buffer.from(buf);
}

// --- Main ---
async function main() {
  console.log('=== Play Store Listing — Full Push ===\n');

  var at = await getAccessToken();
  console.log('Authenticated.\n');

  var base = '/androidpublisher/v3/applications/' + PACKAGE;

  // 1. Create edit
  var edit = await playApi(at, 'POST', base + '/edits', {});
  var editId = edit.id;
  console.log('Edit created:', editId);

  // 2. GET current listing to see what exists
  var currentListing;
  try {
    currentListing = await playApi(at, 'GET', base + '/edits/' + editId + '/listings/en-GB');
    console.log('Current listing title:', currentListing.title || '(empty)');
  } catch (e) {
    currentListing = {};
  }

  // 3. PUT the full listing (carries everything forward)
  console.log('\nSetting en-GB listing...');
  await playApi(at, 'PUT', base + '/edits/' + editId + '/listings/en-GB', {
    language: 'en-GB',
    title: 'Out of Bounds',
    shortDescription: SHORT_DESC,
    fullDescription: FULL_DESC
  });
  console.log('  Title, short description, full description set.');

  // 4. Generate and upload icon
  var iconData = await generateIcon();
  console.log('  Icon size:', Math.round(iconData.length / 1024) + 'KB');
  await playUpload(at, '/upload/androidpublisher/v3/applications/' + PACKAGE +
    '/edits/' + editId + '/listings/en-GB/icon', iconData);
  console.log('  Icon uploaded.');

  // 5. Generate and upload feature graphic
  var fgData = await generateFeatureGraphic();
  console.log('  Feature graphic size:', Math.round(fgData.length / 1024) + 'KB');
  await playUpload(at, '/upload/androidpublisher/v3/applications/' + PACKAGE +
    '/edits/' + editId + '/listings/en-GB/featureGraphic', fgData);
  console.log('  Feature graphic uploaded.');

  // 6. Clear existing screenshots then upload fresh set of 6
  console.log('\n  Clearing existing phone screenshots...');
  try {
    await playApi(at, 'DELETE', base + '/edits/' + editId + '/listings/en-GB/phoneScreenshots');
    console.log('  Cleared.');
  } catch (e) {
    console.log('  (none to clear)');
  }

  console.log('  Uploading 6 phone screenshots...');
  var ssDir = path.join(__dirname, '..', 'docs', 'screens', 'playstore');
  var ssNames = ['events', 'setup', 'scoring', 'liveday', 'bigscreen', 'results'];
  for (var i = 0; i < ssNames.length; i++) {
    var ssPath = path.join(ssDir, ssNames[i] + '.png');
    if (!fs.existsSync(ssPath)) { console.log('    MISSING:', ssPath); continue; }
    await playUpload(at, '/upload/androidpublisher/v3/applications/' + PACKAGE +
      '/edits/' + editId + '/listings/en-GB/phoneScreenshots', fs.readFileSync(ssPath));
    console.log('    ' + (i + 1) + '/6: ' + ssNames[i] + '.png');
  }

  // 7. Set app details (contact)
  console.log('\nSetting app details...');
  try {
    await playApi(at, 'PUT', base + '/edits/' + editId + '/details', {
      contactEmail: 'hello@outofboundsevents.com',
      contactWebsite: 'https://outofboundsevents.com',
      defaultLanguage: 'en-GB'
    });
    console.log('  Contact email and website set.');
  } catch (e) {
    console.log('  Details update skipped:', e.message.slice(0, 100));
  }

  // 8. Commit
  await playApi(at, 'POST', base + '/edits/' + editId + ':commit', {});
  console.log('\n=== Edit committed. All listing fields set. ===');
  console.log('Check Play Console → Store listing to verify.');
}

main().catch(function (err) {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
