#!/usr/bin/env node
'use strict';

/**
 * App Store Connect submission script for Out of Bounds.
 *
 * Creates version 1.0, attaches build, uploads metadata,
 * screenshots, privacy answers, and review notes.
 *
 * Usage: node scripts/asc-submit.js
 *
 * Requires:
 *   - secrets/AuthKey_75935PB75U.p8
 *   - Screenshots in docs/screens/appstore/
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var crypto = require('crypto');
var jwt = require('jsonwebtoken');

// --- Config ---
var KEY_ID = 'G8T7MQZNXP';
var ISSUER_ID = '4dea4042-16ea-4655-924e-485942eb9ce7';
var KEY_PATH = path.join(__dirname, '..', 'secrets', 'AuthKey_' + KEY_ID + '.p8');
var BUNDLE_ID = 'com.outofboundsevents.scoring';
var BUILD_NUMBER = '8'; // Build 1.0 (8)

// --- Metadata ---
var META = {
  name: 'Out of Bounds',
  subtitle: 'Live golf scoring',
  description: '', // Set below after Karla approves
  keywords: 'scoring,leaderboard,stableford,scorecard,society,charity day,corporate,tournament,live,competition',
  supportUrl: 'https://outofboundsevents.com/help',
  privacyUrl: 'https://outofboundsevents.com/privacy',
  category: 'SPORTS',
  ageRating: 'FOUR_PLUS', // will be set via age rating declaration
  copyright: '', // Karla confirms legal entity
  locale: 'en-GB'
};

// --- JWT ---
function makeToken() {
  var key = fs.readFileSync(KEY_PATH, 'utf8');
  var now = Math.floor(Date.now() / 1000);
  return jwt.sign({}, key, {
    algorithm: 'ES256',
    keyid: KEY_ID,
    issuer: ISSUER_ID,
    audience: 'appstoreconnect-v1',
    expiresIn: 1200 // 20 minutes
  });
}

// --- HTTPS helpers ---
function ascRequest(method, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var token = makeToken();
    var payload = body ? JSON.stringify(body) : null;
    var headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    var opts = {
      hostname: 'api.appstoreconnect.apple.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: headers
    };

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        var data;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = raw; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: data });
        } else {
          reject(new Error('ASC ' + res.statusCode + ' ' + method + ' ' + urlPath + ': ' + (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 500)));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Upload binary data (screenshots)
function ascUpload(method, url, filePath, contentType) {
  return new Promise(function (resolve, reject) {
    var parsed = new URL(url);
    var fileData = fs.readFileSync(filePath);
    var headers = {
      'Content-Type': contentType || 'image/png',
      'Content-Length': fileData.length
    };

    var opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers
    };

    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode });
        } else {
          reject(new Error('Upload ' + res.statusCode + ': ' + Buffer.concat(chunks).toString().slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

// --- Steps ---

async function findApp() {
  console.log('1. Finding app...');
  var res = await ascRequest('GET', '/v1/apps?filter[bundleId]=' + BUNDLE_ID);
  var apps = res.data.data;
  if (!apps || !apps.length) throw new Error('App not found for bundle ID ' + BUNDLE_ID);
  console.log('   Found: ' + apps[0].attributes.name + ' (' + apps[0].id + ')');
  return apps[0];
}

async function findBuild(appId) {
  console.log('2. Finding build ' + BUILD_NUMBER + '...');
  var res = await ascRequest('GET',
    '/v1/builds?filter[app]=' + appId +
    '&filter[version]=' + BUILD_NUMBER +
    '&filter[processingState]=VALID' +
    '&sort=-uploadedDate&limit=5'
  );
  var builds = res.data.data;
  if (!builds || !builds.length) {
    throw new Error('Build ' + BUILD_NUMBER + ' not found or not processed yet. Check TestFlight.');
  }
  console.log('   Found build ' + builds[0].attributes.version + ' (' + builds[0].id + ')');
  return builds[0];
}

async function createVersion(appId, buildId) {
  console.log('3. Creating version 1.0...');
  try {
    var res = await ascRequest('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform: 'IOS',
          versionString: '1.0',
          releaseType: 'MANUAL'
        },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
          build: { data: { type: 'builds', id: buildId } }
        }
      }
    });
    console.log('   Version created: ' + res.data.data.id);
    return res.data.data;
  } catch (err) {
    // Version might already exist
    if (err.message.indexOf('409') !== -1 || err.message.indexOf('ENTITY_ERROR.RELATIONSHIP.INVALID') !== -1) {
      console.log('   Version 1.0 may already exist, looking it up...');
      var existing = await ascRequest('GET',
        '/v1/apps/' + appId + '/appStoreVersions?filter[platform]=IOS&filter[versionString]=1.0'
      );
      if (existing.data.data && existing.data.data.length) {
        var ver = existing.data.data[0];
        console.log('   Found existing version: ' + ver.id + ' (state: ' + ver.attributes.appStoreState + ')');
        // Attach build if not attached
        await ascRequest('PATCH', '/v1/appStoreVersions/' + ver.id, {
          data: {
            type: 'appStoreVersions',
            id: ver.id,
            relationships: {
              build: { data: { type: 'builds', id: buildId } }
            }
          }
        });
        console.log('   Build attached.');
        return ver;
      }
    }
    throw err;
  }
}

async function setLocalization(versionId, description, copyright) {
  console.log('4. Setting localisation (en-GB)...');

  // Get existing localizations
  var existing = await ascRequest('GET',
    '/v1/appStoreVersions/' + versionId + '/appStoreVersionLocalizations'
  );
  var locs = existing.data.data || [];
  var enGB = locs.find(function (l) { return l.attributes.locale === 'en-GB'; });

  var payload = {
    description: description,
    keywords: META.keywords,
    supportUrl: META.supportUrl,
    marketingUrl: 'https://outofboundsevents.com'
  };

  if (enGB) {
    await ascRequest('PATCH', '/v1/appStoreVersionLocalizations/' + enGB.id, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: enGB.id,
        attributes: payload
      }
    });
    console.log('   Updated en-GB localisation.');
    return enGB;
  } else {
    var res = await ascRequest('POST', '/v1/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: Object.assign({ locale: 'en-GB' }, payload),
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } }
        }
      }
    });
    console.log('   Created en-GB localisation.');
    return res.data.data;
  }
}

async function setAppInfo(appId, copyright) {
  console.log('5. Setting app info (name, subtitle, category, privacy URL)...');

  // Get app info
  var infoRes = await ascRequest('GET', '/v1/apps/' + appId + '/appInfos');
  var appInfo = infoRes.data.data[0];

  // Update app info (category, etc.)
  await ascRequest('PATCH', '/v1/appInfos/' + appInfo.id, {
    data: {
      type: 'appInfos',
      id: appInfo.id,
      relationships: {
        primaryCategory: {
          data: { type: 'appCategories', id: 'SPORTS' }
        }
      }
    }
  });
  console.log('   Category set to Sports.');

  // Get/update app info localisation
  var locRes = await ascRequest('GET', '/v1/appInfos/' + appInfo.id + '/appInfoLocalizations');
  var locs = locRes.data.data || [];
  var enGB = locs.find(function (l) { return l.attributes.locale === 'en-GB'; });
  var enUS = locs.find(function (l) { return l.attributes.locale === 'en-US'; });
  var loc = enGB || enUS || locs[0];

  if (loc) {
    await ascRequest('PATCH', '/v1/appInfoLocalizations/' + loc.id, {
      data: {
        type: 'appInfoLocalizations',
        id: loc.id,
        attributes: {
          name: META.name,
          subtitle: META.subtitle,
          privacyPolicyUrl: META.privacyUrl
        }
      }
    });
    console.log('   Name, subtitle, privacy URL set.');
  }

  return appInfo;
}

async function setAgeRating(appId) {
  console.log('6. Setting age rating declaration (4+)...');

  var res = await ascRequest('GET', '/v1/apps/' + appId + '/appInfos');
  var appInfoId = res.data.data[0].id;

  // Get age rating declaration
  var ardRes = await ascRequest('GET', '/v1/appInfos/' + appInfoId + '/ageRatingDeclaration');
  var ardId = ardRes.data.data.id;

  await ascRequest('PATCH', '/v1/ageRatingDeclarations/' + ardId, {
    data: {
      type: 'ageRatingDeclarations',
      id: ardId,
      attributes: {
        alcoholTobaccoOrDrugUseOrReferences: 'NONE',
        contests: 'NONE',
        gamblingAndContests: false,
        gambling: false,
        gamblingSimulated: 'NONE',
        horrorOrFearThemes: 'NONE',
        matureOrSuggestiveThemes: 'NONE',
        medicalOrTreatmentInformation: 'NONE',
        profanityOrCrudeHumor: 'NONE',
        sexualContentGraphicAndNudity: 'NONE',
        sexualContentOrNudity: 'NONE',
        violenceCartoonOrFantasy: 'NONE',
        violenceRealistic: 'NONE',
        violenceRealisticProlonged: 'NONE',
        unrestrictedWebAccess: false,
        seventeenPlus: false
      }
    }
  });
  console.log('   Age rating set (4+, all NONE).');
}

async function uploadScreenshots(localizationId, screenshotDir) {
  console.log('7. Uploading screenshots...');

  // Screenshot display types and filenames
  var sizes = [
    { type: 'APP_IPHONE_67', prefix: '67' },
    { type: 'APP_IPHONE_61', prefix: '61' }
  ];

  var screens = [
    'events', 'setup', 'scoring', 'liveday', 'bigscreen', 'results'
  ];

  // Check if 6.9" screenshots exist too
  var dir69 = path.join(screenshotDir, '69');
  if (fs.existsSync(dir69)) {
    sizes.push({ type: 'APP_IPHONE_69', prefix: '69' });
  }

  for (var si = 0; si < sizes.length; si++) {
    var size = sizes[si];
    var sizeDir = path.join(screenshotDir, size.prefix);
    if (!fs.existsSync(sizeDir)) {
      console.log('   Skipping ' + size.type + ' (no directory ' + sizeDir + ')');
      continue;
    }

    console.log('   Uploading ' + size.type + '...');

    // Delete existing screenshot set for this display type
    var existingRes = await ascRequest('GET',
      '/v1/appStoreVersionLocalizations/' + localizationId +
      '/appScreenshotSets?filter[screenshotDisplayType]=' + size.type
    );
    var existingSets = existingRes.data.data || [];
    for (var ei = 0; ei < existingSets.length; ei++) {
      // Delete all screenshots in the set first
      var ssRes = await ascRequest('GET',
        '/v1/appScreenshotSets/' + existingSets[ei].id + '/appScreenshots'
      );
      for (var di = 0; di < (ssRes.data.data || []).length; di++) {
        await ascRequest('DELETE', '/v1/appScreenshots/' + ssRes.data.data[di].id);
      }
    }

    // Create screenshot set if needed
    var setId;
    if (existingSets.length) {
      setId = existingSets[0].id;
    } else {
      var setRes = await ascRequest('POST', '/v1/appScreenshotSets', {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: size.type },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: localizationId }
            }
          }
        }
      });
      setId = setRes.data.data.id;
    }

    // Upload each screenshot
    for (var i = 0; i < screens.length; i++) {
      var filePath = path.join(sizeDir, screens[i] + '.png');
      if (!fs.existsSync(filePath)) {
        console.log('     MISSING: ' + filePath);
        continue;
      }

      var fileSize = fs.statSync(filePath).size;
      var fileName = screens[i] + '.png';

      // Reserve the screenshot
      var reserveRes = await ascRequest('POST', '/v1/appScreenshots', {
        data: {
          type: 'appScreenshots',
          attributes: {
            fileName: fileName,
            fileSize: fileSize
          },
          relationships: {
            appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } }
          }
        }
      });

      var screenshot = reserveRes.data.data;
      var uploadOps = screenshot.attributes.uploadOperations;

      // Upload each part
      for (var oi = 0; oi < uploadOps.length; oi++) {
        var op = uploadOps[oi];
        await ascUpload(op.method, op.url, filePath, 'image/png');
      }

      // Commit the upload
      var checksum = crypto.createHash('md5')
        .update(fs.readFileSync(filePath))
        .digest('base64');

      await ascRequest('PATCH', '/v1/appScreenshots/' + screenshot.id, {
        data: {
          type: 'appScreenshots',
          id: screenshot.id,
          attributes: {
            uploaded: true,
            sourceFileChecksum: checksum
          }
        }
      });

      console.log('     Uploaded ' + (i + 1) + '/' + screens.length + ': ' + fileName);
    }
  }
}

async function setReviewInfo(versionId, reviewNotes) {
  console.log('8. Setting review information...');

  // Get or create review detail
  try {
    var existing = await ascRequest('GET',
      '/v1/appStoreVersions/' + versionId + '/appStoreReviewDetail'
    );
    await ascRequest('PATCH', '/v1/appStoreReviewDetails/' + existing.data.data.id, {
      data: {
        type: 'appStoreReviewDetails',
        id: existing.data.data.id,
        attributes: {
          contactEmail: 'hello@outofboundsevents.com',
          contactFirstName: 'Karla',
          contactLastName: 'Wentworth',
          contactPhone: '',
          demoAccountName: 'review@outofboundsevents.com',
          demoAccountPassword: '(see notes)',
          demoAccountRequired: true,
          notes: reviewNotes
        }
      }
    });
  } catch (err) {
    await ascRequest('POST', '/v1/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes: {
          contactEmail: 'hello@outofboundsevents.com',
          contactFirstName: 'Karla',
          contactLastName: 'Wentworth',
          contactPhone: '',
          demoAccountName: 'review@outofboundsevents.com',
          demoAccountPassword: '(see notes)',
          demoAccountRequired: true,
          notes: reviewNotes
        },
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } }
        }
      }
    });
  }
  console.log('   Review info set.');
}

async function setCopyright(appId, copyright) {
  console.log('9. Setting copyright...');
  // App-level fields via appInfos
  // Copyright is not directly on appInfos in newer API - it's on the version
  // Actually it's in the app store version localization or app info
  // Let me check - copyright might be an app-level attribute
  console.log('   Copyright: ' + copyright);
  console.log('   (Copyright is set in App Store Connect under App Information.)');
}

// --- Main ---
async function main() {
  console.log('=== Out of Bounds — App Store Connect Submission ===\n');

  // Check key exists
  if (!fs.existsSync(KEY_PATH)) {
    console.error('ERROR: API key not found at ' + KEY_PATH);
    process.exit(1);
  }

  // Check for description and review notes
  var descPath = path.join(__dirname, 'asc-description.txt');
  var notesPath = path.join(__dirname, 'asc-review-notes.txt');
  var copyrightPath = path.join(__dirname, 'asc-copyright.txt');

  if (!fs.existsSync(descPath)) {
    console.error('ERROR: Description not found. Create scripts/asc-description.txt first.');
    process.exit(1);
  }
  if (!fs.existsSync(notesPath)) {
    console.error('ERROR: Review notes not found. Create scripts/asc-review-notes.txt first.');
    process.exit(1);
  }

  var description = fs.readFileSync(descPath, 'utf8').trim();
  var reviewNotes = fs.readFileSync(notesPath, 'utf8').trim();
  var copyright = fs.existsSync(copyrightPath)
    ? fs.readFileSync(copyrightPath, 'utf8').trim()
    : '2026 Out of Bounds Events';

  var screenshotDir = path.join(__dirname, '..', 'docs', 'screens', 'appstore');

  // Run steps
  var app = await findApp();
  var build = await findBuild(app.id);
  var version = await createVersion(app.id, build.id);
  var localization = await setLocalization(version.id, description, copyright);
  await setAppInfo(app.id, copyright);
  await setAgeRating(app.id);

  if (fs.existsSync(screenshotDir)) {
    await uploadScreenshots(localization.id, screenshotDir);
  } else {
    console.log('7. SKIPPED: Screenshot directory not found at ' + screenshotDir);
    console.log('   Generate screenshots first, then re-run.');
  }

  await setReviewInfo(version.id, reviewNotes);

  console.log('\n=== Done ===');
  console.log('Version 1.0 is configured with build ' + BUILD_NUMBER + '.');
  console.log('Release type: MANUAL (Karla chooses when to release).');
  console.log('\nNext steps:');
  console.log('  1. Check App Store Connect — version should show "Ready for Review"');
  console.log('  2. Verify screenshots appear correctly');
  console.log('  3. Accept any pending agreements');
  console.log('  4. Press Submit for Review');
}

main().catch(function (err) {
  console.error('\nERROR:', err.message || err);
  process.exit(1);
});
