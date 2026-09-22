'use strict';

var sb = require('./shared/supabase');
var https = require('https');

var ANTHROPIC_HOST = 'api.anthropic.com';

function callClaude(base64Image, mediaType) {
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Promise.reject(new Error('ANTHROPIC_API_KEY not set'));

  var prompt = [
    'You are reading a golf club scorecard photograph.',
    'Return ONLY valid JSON, no markdown, no explanation.',
    'Extract this structure:',
    '{',
    '  "club_name": "string or null",',
    '  "course_name": "string or null",',
    '  "tee_sets": [',
    '    {',
    '      "tee_name": "string (e.g. White, Yellow, Red)",',
    '      "colour": "string or null",',
    '      "gender": "female | male | null",',
    '      "slope_rating": number or null,',
    '      "course_rating": number or null,',
    '      "par_total": number or null,',
    '      "confidence": number 0-1,',
    '      "check_holes": [list of hole numbers where the read was unsure],',
    '      "holes": [',
    '        {"hole": 1, "par": number, "stroke_index": number, "yards": number or null},',
    '        ... up to 18 (or 9 for a 9-hole card)',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- hole numbers are from 1 to 18 (or 1 to 9). Use array position if not printed.',
    '- "stroke_index" is the handicap/SI column, NOT the hole number.',
    '- par is always 3, 4, 5, or rarely 6.',
    '- stroke_index values must be 1-18 for 18 holes, 1-9 for 9 holes, each used exactly once per tee set.',
    '- If you cannot read a value clearly, set it to null and add the hole number to check_holes.',
    '- slope_rating is typically 55-155. course_rating is typically 50-85.',
    '- If the card shows separate men\'s and ladies\' sections, create separate tee_sets with gender set.',
    '- Look for tee colours: white, yellow, blue, red, etc.',
    '- Return null for anything not visible or legible. Never guess.',
    '- confidence is your overall confidence in the tee set read (0=unreadable, 1=perfect).'
  ].join('\n');

  var body = {
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Image
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  };

  var payload = JSON.stringify(body);

  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('TIMEOUT')); }, 9000);

    var req = https.request({
      hostname: ANTHROPIC_HOST,
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error('Anthropic ' + res.statusCode + ': ' + raw.slice(0, 300)));
          return;
        }
        try {
          var parsed = JSON.parse(raw);
          var text = '';
          (parsed.content || []).forEach(function (b) { if (b.type === 'text') text += b.text; });
          resolve(text);
        } catch (e) { reject(new Error('Bad response from Anthropic')); }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    req.write(payload);
    req.end();
  });
}

function validate(card) {
  var warnings = [];

  (card.tee_sets || []).forEach(function (ts, ti) {
    var holes = ts.holes || [];
    var n = holes.length;
    if (n !== 9 && n !== 18) warnings.push({ tee: ti, issue: 'Expected 9 or 18 holes, got ' + n });

    var parSum = 0;
    var siSeen = {};
    var maxSI = n;

    holes.forEach(function (h, hi) {
      var hn = hi + 1;
      // Par check
      if (h.par != null && (h.par < 3 || h.par > 6)) {
        warnings.push({ tee: ti, hole: hn, field: 'par', value: h.par, issue: 'Par must be 3-6' });
      }
      if (h.par != null) parSum += h.par;

      // SI check
      if (h.stroke_index != null) {
        if (h.stroke_index < 1 || h.stroke_index > maxSI) {
          warnings.push({ tee: ti, hole: hn, field: 'stroke_index', value: h.stroke_index, issue: 'SI must be 1-' + maxSI });
        }
        if (siSeen[h.stroke_index]) {
          warnings.push({ tee: ti, hole: hn, field: 'stroke_index', value: h.stroke_index, issue: 'Duplicate SI' });
        }
        siSeen[h.stroke_index] = true;
      }
    });

    // Par total check
    if (ts.par_total != null && parSum > 0 && ts.par_total !== parSum) {
      warnings.push({ tee: ti, field: 'par_total', value: ts.par_total, issue: 'Par total ' + ts.par_total + ' does not match sum ' + parSum });
    }

    // Slope check
    if (ts.slope_rating != null && (ts.slope_rating < 55 || ts.slope_rating > 155)) {
      warnings.push({ tee: ti, field: 'slope_rating', value: ts.slope_rating, issue: 'Slope should be 55-155' });
    }

    // Rating check
    if (ts.course_rating != null && (ts.course_rating < 50 || ts.course_rating > 85)) {
      warnings.push({ tee: ti, field: 'course_rating', value: ts.course_rating, issue: 'Rating should be 50-85' });
    }

    // Missing SIs check
    for (var s = 1; s <= maxSI; s++) {
      if (!siSeen[s]) {
        warnings.push({ tee: ti, field: 'stroke_index', issue: 'Missing SI ' + s });
      }
    }
  });

  return warnings;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  var image = body.image; // base64 encoded
  var mediaType = body.media_type || 'image/jpeg';

  if (!image) return sb.respond(400, { error: 'Missing image data' });

  // Basic size check — base64 is ~33% larger than binary, so 1.5MB base64 ≈ 1MB image
  if (image.length > 2000000) {
    return sb.respond(400, { error: 'Image too large. Resize to under 1600px before uploading.' });
  }

  try {
    var responseText = await callClaude(image, mediaType);

    // Parse the JSON from Claude's response
    // Strip any markdown code fences if present
    var jsonText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    var card;
    try {
      card = JSON.parse(jsonText);
    } catch (e) {
      return sb.respond(422, {
        error: 'Could not parse the scorecard. Try a clearer photo.',
        raw: responseText.slice(0, 500)
      });
    }

    // Validate
    var warnings = validate(card);

    return sb.respond(200, {
      card: card,
      warnings: warnings,
      has_warnings: warnings.length > 0
    });

  } catch (err) {
    if (err.message === 'TIMEOUT') {
      return sb.respond(408, {
        error: 'Reading the card took too long. Try a clearer, well-lit photo with less glare.'
      });
    }
    console.error('course-from-photo error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
