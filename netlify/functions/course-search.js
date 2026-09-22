'use strict';

var sb = require('./shared/supabase');
var https = require('https');

var API_HOST = 'api.golfcourseapi.com';
var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory search cache (survives within a single function instance)
var searchCache = {};

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
  if (event.httpMethod !== 'GET') return sb.respond(405, { error: 'Method not allowed' });

  var qs = event.queryStringParameters || {};
  var q = (qs.q || '').trim();
  if (!q || q.length < 2) return sb.respond(400, { error: 'Search query must be at least 2 characters' });

  try {
    // 1. Search our own library first
    var ownResults = [];
    try {
      var own = await sb.sbGet(
        'courses?or=(name.ilike.*' + encodeURIComponent(q) + '*,club.ilike.*' + encodeURIComponent(q) + '*)' +
        '&select=id,name,club,city,country,source,verified' +
        '&limit=10'
      );
      ownResults = (own || []).map(function (c) {
        return {
          id: c.id,
          club_name: c.club || '',
          course_name: c.name || '',
          city: c.city || '',
          country: c.country || '',
          source: 'library',
          verified: c.verified || false,
          label: 'In your library'
        };
      });
    } catch (e) { console.error('Own library search failed:', e.message); }

    // 2. Check cache for GolfCourseAPI results
    var cacheKey = q.toLowerCase();
    var cached = searchCache[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return sb.respond(200, { results: ownResults.concat(cached.data) });
    }

    // 3. Check rate limit
    var callsToday = await countCallsToday();
    if (callsToday >= 30) {
      // Return own library results only, with a note
      return sb.respond(200, {
        results: ownResults,
        rate_limited: true,
        message: 'Course lookup is busy today. Add by hand or try tomorrow.'
      });
    }

    // 4. Call GolfCourseAPI
    var apiResults = [];
    try {
      var data = await golfApiGet('/v1/search?search_query=' + encodeURIComponent(q));
      await logCall('/v1/search', true);

      var courses = data.courses || [];
      apiResults = courses.map(function (c) {
        return {
          id: c.id,
          club_name: c.club_name || '',
          course_name: c.course_name || '',
          city: c.location ? c.location.city || '' : '',
          country: c.location ? c.location.country || '' : '',
          source: 'golfcourseapi',
          tee_count: c.tee_boxes ? c.tee_boxes.length : 0
        };
      });

      // Cache the results
      searchCache[cacheKey] = { ts: Date.now(), data: apiResults };
    } catch (err) {
      console.error('GolfCourseAPI search failed:', err.message);
      await logCall('/v1/search', false);
      // Return own results even if API fails
    }

    // 5. Merge: own library first, then API results (dedupe by source_id)
    var seenIds = {};
    ownResults.forEach(function (r) { if (r.id) seenIds[r.id] = true; });

    var merged = ownResults.concat(apiResults.filter(function (r) {
      return !seenIds[r.id];
    }));

    return sb.respond(200, { results: merged });
  } catch (err) {
    console.error('course-search error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
