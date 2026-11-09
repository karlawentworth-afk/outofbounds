#!/usr/bin/env node
'use strict';

/**
 * Upload App Store screenshots via the ASC API.
 * Usage: node scripts/asc-upload-screenshots.js
 *
 * Requires: secrets/AuthKey_G8T7MQZNXP.p8
 * Reads PNGs from docs/store/ios/iphone-69/ and docs/store/ios/ipad-13/
 */

var jwt = require('jsonwebtoken');
var fs = require('fs');
var path = require('path');
var https = require('https');
var crypto = require('crypto');

var KEY_ID = 'G8T7MQZNXP';
var ISSUER_ID = '4dea4042-16ea-4655-924e-485942eb9ce7';
var APP_ID = '6820134986';
var KEY_PATH = path.join(__dirname, '..', 'secrets', 'AuthKey_G8T7MQZNXP.p8');
var privateKey = fs.readFileSync(KEY_PATH, 'utf8');

function makeToken() {
  var now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }, privateKey, { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } });
}

function ascRequest(method, apiPath, body, retry) {
  return new Promise(function (resolve, reject) {
    var token = makeToken();
    var payload = body ? JSON.stringify(body) : null;
    var headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var req = https.request({ hostname: 'api.appstoreconnect.apple.com', path: apiPath, method: method, headers: headers }, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () {
        var raw = Buffer.concat(c).toString();
        if (res.statusCode >= 500 && !retry) {
          console.log('  Retrying on ' + res.statusCode + '...');
          return ascRequest(method, apiPath, body, true).then(resolve, reject);
        }
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadChunk(url, headers, data) {
  return new Promise(function (resolve, reject) {
    var parsed = new URL(url);
    var opts = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'PUT', headers: {} };
    Object.keys(headers).forEach(function (k) { opts.headers[k] = headers[k]; });
    opts.headers['Content-Length'] = data.length;
    var req = https.request(opts, function (res) {
      var c = []; res.on('data', function (d) { c.push(d); }); res.on('end', function () { resolve(res.statusCode); });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var SETS = [
  { dir: 'iphone-69', setId: '885e671f-11b6-44f9-a3ba-b94a7e4ece0e', displayType: 'APP_IPHONE_67', expectedW: 1320, expectedH: 2868 },
  { dir: 'ipad-13', setId: 'f9f8330b-be04-4e7e-a2cb-8ef68e8cc81b', displayType: 'APP_IPAD_PRO_3GEN_129', expectedW: 2064, expectedH: 2752 }
];

async function main() {
  console.log('=== ASC Screenshot Upload ===\n');

  for (var si = 0; si < SETS.length; si++) {
    var set = SETS[si];
    console.log('--- ' + set.displayType + ' (' + set.dir + ') ---');

    // Step 3: Delete existing screenshots in this set
    var existing = await ascRequest('GET', '/v1/appScreenshotSets/' + set.setId + '/appScreenshots');
    if (existing.data && existing.data.data) {
      for (var di = 0; di < existing.data.data.length; di++) {
        var delId = existing.data.data[di].id;
        var delRes = await ascRequest('DELETE', '/v1/appScreenshots/' + delId);
        console.log('  Deleted ' + delId + ' status=' + delRes.status);
      }
    }

    // Step 4: Upload 01-05
    for (var fi = 1; fi <= 5; fi++) {
      var fileName = '0' + fi + '.png';
      var filePath = path.join(__dirname, '..', 'docs', 'store', 'ios', set.dir, fileName);
      var fileData = fs.readFileSync(filePath);
      var fileSize = fileData.length;
      var md5 = crypto.createHash('md5').update(fileData).digest('hex');

      console.log('  Uploading ' + fileName + ' (' + fileSize + ' bytes, md5=' + md5 + ')');

      // Reserve
      var reserveRes = await ascRequest('POST', '/v1/appScreenshots', {
        data: {
          type: 'appScreenshots',
          attributes: { fileName: fileName, fileSize: fileSize },
          relationships: {
            appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.setId } }
          }
        }
      });

      if (reserveRes.status !== 201) {
        console.log('  RESERVE FAILED: ' + reserveRes.status + ' ' + JSON.stringify(reserveRes.data).substring(0, 300));
        continue;
      }

      var screenshotId = reserveRes.data.data.id;
      var ops = reserveRes.data.data.attributes.uploadOperations;
      console.log('  Reserved: ' + screenshotId + ', ' + ops.length + ' chunks');

      // Upload chunks
      for (var oi = 0; oi < ops.length; oi++) {
        var op = ops[oi];
        var chunk = fileData.slice(op.offset, op.offset + op.length);
        var chunkHeaders = {};
        (op.requestHeaders || []).forEach(function (h) { chunkHeaders[h.name] = h.value; });
        var uploadStatus = await uploadChunk(op.url, chunkHeaders, chunk);
        if (uploadStatus >= 300) {
          console.log('  CHUNK FAILED: ' + uploadStatus + ' at offset ' + op.offset);
        }
      }

      // Commit
      var commitRes = await ascRequest('PATCH', '/v1/appScreenshots/' + screenshotId, {
        data: {
          type: 'appScreenshots',
          id: screenshotId,
          attributes: {
            uploaded: true,
            sourceFileChecksum: md5
          }
        }
      });
      console.log('  Committed: status=' + commitRes.status);

      // Step 5: Poll until COMPLETE
      for (var poll = 0; poll < 30; poll++) {
        await sleep(2000);
        var checkRes = await ascRequest('GET', '/v1/appScreenshots/' + screenshotId + '?fields[appScreenshots]=assetDeliveryState,fileName');
        var state = checkRes.data && checkRes.data.data && checkRes.data.data.attributes.assetDeliveryState;
        if (state && state.state === 'COMPLETE') {
          console.log('  COMPLETE');
          break;
        } else if (state && state.state === 'FAILED') {
          console.log('  FAILED: ' + JSON.stringify(state.errors));
          break;
        }
        if (poll === 29) console.log('  TIMEOUT waiting for processing');
      }
    }
  }

  // Step 6: Verify
  console.log('\n=== Verification ===');
  for (var vi = 0; vi < SETS.length; vi++) {
    var vset = SETS[vi];
    var verifyRes = await ascRequest('GET', '/v1/appScreenshotSets/' + vset.setId + '/appScreenshots?fields[appScreenshots]=fileName,assetDeliveryState,imageAsset');
    var screenshots = verifyRes.data && verifyRes.data.data || [];
    console.log(vset.displayType + ': ' + screenshots.length + ' screenshots');
    screenshots.forEach(function (s) {
      var a = s.attributes;
      var state = a.assetDeliveryState ? a.assetDeliveryState.state : '?';
      var w = a.imageAsset ? a.imageAsset.width : '?';
      var h = a.imageAsset ? a.imageAsset.height : '?';
      var sizeOk = w === vset.expectedW && h === vset.expectedH;
      console.log('  ' + a.fileName + ': ' + state + ' ' + w + 'x' + h + (sizeOk ? ' OK' : ' MISMATCH'));
    });
  }

  console.log('\nDone.');
}

main().catch(function (e) { console.error('FATAL:', e.message); process.exit(1); });
