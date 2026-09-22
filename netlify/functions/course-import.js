'use strict';

var sb = require('./shared/supabase');
var https = require('https');

var API_HOST = 'api.golfcourseapi.com';

function golfApiGet(path) {
  var key = process.env.GOLFCOURSEAPI_KEY;
  if (!key) return Promise.reject(new Error('GOLFCOURSEAPI_KEY not set'));

  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('GolfCourseAPI timeout')); }, 9000);
    var req = https.request({
      hostname: API_HOST,
      port: 443,
      path: path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + key }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error('GolfCourseAPI ' + res.statusCode + ': ' + raw.slice(0, 200)));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Bad JSON from GolfCourseAPI')); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    req.end();
  });
}

async function countCallsToday() {
  var today = new Date().toISOString().split('T')[0];
  var rows = await sb.sbGet(
    'api_calls?api_name=eq.golfcourseapi&called_at=gte.' + today + 'T00:00:00Z&select=id'
  );
  return (rows || []).length;
}

async function logCall(endpoint, ok) {
  try {
    await sb.sbPost('api_calls', {
      api_name: 'golfcourseapi',
      endpoint: endpoint,
      response_ok: ok
    });
  } catch (e) { console.error('Failed to log API call:', e.message); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  var sourceId = body.id;
  if (!sourceId) return sb.respond(400, { error: 'Missing course id' });

  try {
    // 1. Check if already imported (idempotent)
    var existing = await sb.sbGet(
      'courses?source=eq.golfcourseapi&source_id=eq.' + encodeURIComponent(sourceId) +
      '&select=id,name,club' +
      '&limit=1'
    );
    if (existing && existing.length > 0) {
      return sb.respond(200, { course_id: existing[0].id, already_imported: true });
    }

    // 2. Rate limit check
    var callsToday = await countCallsToday();
    if (callsToday >= 30) {
      return sb.respond(429, {
        error: 'Course lookup is busy today. Add by hand or try tomorrow.',
        rate_limited: true
      });
    }

    // 3. Fetch course detail from GolfCourseAPI
    var data = await golfApiGet('/v1/courses/' + encodeURIComponent(sourceId));
    await logCall('/v1/courses/' + sourceId, true);

    var course = data.course || data;

    // 4. Create course row
    var loc = course.location || {};
    var courseRow = {
      name: course.course_name || 'Unknown Course',
      club: course.club_name || '',
      city: loc.city || null,
      country: loc.country || null,
      latitude: loc.latitude || null,
      longitude: loc.longitude || null,
      scorecard_url: course.scorecard_url || null,
      source: 'golfcourseapi',
      source_id: String(sourceId),
      imported_at: new Date().toISOString(),
      verified: false
    };

    var created = await sb.sbPost('courses', courseRow);
    var courseId = (Array.isArray(created) ? created[0] : created).id;

    // 5. Create tee boxes
    var teeBoxes = course.tee_boxes || [];
    var skippedTees = [];
    var createdTees = [];

    for (var t = 0; t < teeBoxes.length; t++) {
      var tee = teeBoxes[t];

      // Skip tees with no slope or rating
      if (!tee.slope_rating && !tee.course_rating) {
        skippedTees.push(tee.tee_name || 'Tee ' + (t + 1));
        continue;
      }

      var numHoles = (tee.holes || []).length || 18;
      var parTotal = 0;
      (tee.holes || []).forEach(function (h) { parTotal += h.par || 0; });

      var teeRow = {
        course_id: courseId,
        tee_name: tee.tee_name || 'Tee ' + (t + 1),
        colour: (tee.tee_name || '').toLowerCase(),
        slope: tee.slope_rating || null,
        rating: tee.course_rating || null,
        par_total: parTotal || null,
        tee_set: tee.gender === 'female' ? 'female' : tee.gender === 'male' ? 'male' : null,
        total_yards: tee.total_yards || null,
        number_of_holes: numHoles
      };

      var createdTee = await sb.sbPost('course_tees', teeRow);
      var teeId = (Array.isArray(createdTee) ? createdTee[0] : createdTee).id;

      createdTees.push({
        id: teeId,
        tee_name: teeRow.tee_name,
        tee_set: teeRow.tee_set,
        slope: teeRow.slope,
        rating: teeRow.rating,
        par_total: teeRow.par_total,
        number_of_holes: numHoles
      });
    }

    // 6. Create holes (from the first tee that has them — holes are per-course, not per-tee)
    // Actually, different tees can have different hole data. Use the first tee with holes.
    var holesSource = null;
    for (var i = 0; i < teeBoxes.length; i++) {
      if (teeBoxes[i].holes && teeBoxes[i].holes.length > 0) {
        holesSource = teeBoxes[i].holes;
        break;
      }
    }

    var holesCreated = 0;
    if (holesSource) {
      for (var h = 0; h < holesSource.length; h++) {
        var hole = holesSource[h];
        var holeRow = {
          course_id: courseId,
          hole_number: h + 1,
          par: hole.par || 4,
          stroke_index: hole.handicap || (h + 1)  // 'handicap' field = stroke index
        };

        // Validate stroke_index is 1-18
        if (holeRow.stroke_index < 1 || holeRow.stroke_index > 18) {
          holeRow.stroke_index = h + 1;
        }

        await sb.sbPost('course_holes', holeRow);
        holesCreated++;
      }
    }

    return sb.respond(200, {
      course_id: courseId,
      already_imported: false,
      tees: createdTees,
      holes_created: holesCreated,
      skipped_tees: skippedTees.length > 0 ? skippedTees : undefined,
      skipped_reason: skippedTees.length > 0 ? 'No slope or rating data' : undefined
    });

  } catch (err) {
    console.error('course-import error:', err);
    if (err.message && err.message.indexOf('GolfCourseAPI') !== -1) {
      await logCall('/v1/courses/' + sourceId, false);
    }
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
