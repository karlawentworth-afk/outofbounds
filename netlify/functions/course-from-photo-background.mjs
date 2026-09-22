// Background function — runs up to 15 minutes, returns 202 immediately.
// Netlify background functions must use .mjs extension or export default.

import https from 'https';

const SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
const ANTHROPIC_HOST = 'api.anthropic.com';

function sbRequest(method, path, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': key, 'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({
      hostname: SB_HOST, port: 443,
      path: '/rest/v1/' + path, method, headers
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('Supabase ' + res.statusCode + ': ' + raw.slice(0, 200)));
          return;
        }
        try { resolve(raw ? JSON.parse(raw) : null); }
        catch (e) { reject(new Error('Bad JSON: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sbGet(path) { return sbRequest('GET', path, null); }
function sbPatch(path, body) { return sbRequest('PATCH', path, body); }

function fetchPhoto(path) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SB_HOST, port: 443,
      path: '/storage/v1/object/scorecards/' + path,
      method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('Storage ' + res.statusCode));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function callClaude(base64Image, mediaType) {
  const key = process.env.ANTHROPIC_API_KEY;

  const prompt = `You are reading a golf club scorecard photograph.
Return ONLY valid JSON, no markdown fences, no explanation.

IMPORTANT: WHS scorecards often print TWO course ratings and TWO slope ratings
for each tee colour — one row labelled M (men) and one labelled L (ladies/women).
These are DIFFERENT numbers for the SAME tee. You MUST return BOTH when present.

Extract this structure:
{
  "club_name": "string or null",
  "course_name": "string or null",
  "tee_sets": [
    {
      "tee_name": "string (e.g. White, Yellow, Red)",
      "colour": "string or null",
      "rating_men": number or null,
      "slope_men": number or null,
      "rating_women": number or null,
      "slope_women": number or null,
      "par_total": number,
      "confidence": number 0-1,
      "check_holes": [hole numbers where read was unsure],
      "holes": [
        {"hole": 1, "par": number, "stroke_index": number, "yards": number or null}
      ]
    }
  ]
}

Rules:
- For EACH tee colour, look at the rating/slope box at the top of the card.
  Cards typically show rows like:
    Course  Slope
    73.7    136      (this is for one tee, e.g. Blue)
    73.1    135      (White)
    71.6    133      (Yellow)
    68.4    131   M  (Red, men's rating — look for M or similar marker)
    73.8    132   L  (Red, ladies' rating — look for L or similar marker)
  When a tee has TWO rating rows (marked M and L, or men and ladies),
  return rating_men/slope_men from the M row and rating_women/slope_women
  from the L row.
- When a tee has only ONE rating row with no M/L marker, return it under
  "rating_unlabelled" and "slope_unlabelled" instead, and add a warning
  in check_holes as [-1] to flag it.
- Tees used only by men (Blue, White, Yellow typically) often have just one
  rating — put it under rating_men/slope_men, set women's to null.
- Tees used by women (Red typically) almost always have two rating rows.
- stroke_index is the handicap/SI column, NOT the hole number.
- par is always 3, 4, 5, or rarely 6.
- stroke_index values must be 1-18 each used exactly once per tee set (or 1-9 for 9-hole).
- If you cannot read a value, set null and add hole number to check_holes.
- Slope typically 55-155. Course rating typically 50-85.
- If a tee has separate men's and ladies' pars or SIs (different columns on
  the card), return them as separate tee_sets with the same tee_name.
- Prioritise pars and stroke_indexes over yardages. If running long, omit yards.
- Return null for anything not visible. Never guess.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: ANTHROPIC_HOST, port: 443, path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error('Anthropic ' + res.statusCode + ': ' + raw.slice(0, 300)));
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          let text = '';
          (parsed.content || []).forEach(b => { if (b.type === 'text') text += b.text; });
          resolve(text);
        } catch (e) { reject(new Error('Bad response from Anthropic')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function validate(card) {
  const warnings = [];
  (card.tee_sets || []).forEach((ts, ti) => {
    const holes = ts.holes || [];
    const n = holes.length;
    if (n !== 9 && n !== 18) warnings.push({ tee: ti, issue: 'Expected 9 or 18 holes, got ' + n });
    let parSum = 0;
    const siSeen = {};
    const maxSI = n;
    holes.forEach((h, hi) => {
      const hn = hi + 1;
      if (h.par != null && (h.par < 3 || h.par > 6))
        warnings.push({ tee: ti, hole: hn, field: 'par', value: h.par, issue: 'Par must be 3-6' });
      if (h.par != null) parSum += h.par;
      if (h.stroke_index != null) {
        if (h.stroke_index < 1 || h.stroke_index > maxSI)
          warnings.push({ tee: ti, hole: hn, field: 'stroke_index', value: h.stroke_index, issue: 'SI must be 1-' + maxSI });
        if (siSeen[h.stroke_index])
          warnings.push({ tee: ti, hole: hn, field: 'stroke_index', value: h.stroke_index, issue: 'Duplicate SI' });
        siSeen[h.stroke_index] = true;
      }
    });
    if (ts.par_total != null && parSum > 0 && ts.par_total !== parSum)
      warnings.push({ tee: ti, field: 'par_total', value: ts.par_total, issue: 'Par total ' + ts.par_total + ' does not match sum ' + parSum });

    // Validate each rating/slope pair
    var pairs = [
      ['slope_men', 'rating_men', 'men'],
      ['slope_women', 'rating_women', 'women'],
      ['slope_unlabelled', 'rating_unlabelled', 'unlabelled']
    ];
    pairs.forEach(function(p) {
      var slope = ts[p[0]], rating = ts[p[1]], label = p[2];
      if (slope != null && (slope < 55 || slope > 155))
        warnings.push({ tee: ti, field: p[0], value: slope, issue: label + ' slope should be 55-155' });
      if (rating != null && (rating < 50 || rating > 85))
        warnings.push({ tee: ti, field: p[1], value: rating, issue: label + ' rating should be 50-85' });
    });

    // Women's rating lower than men's on the same tee = likely misread
    if (ts.rating_women != null && ts.rating_men != null && ts.rating_women < ts.rating_men)
      warnings.push({ tee: ti, field: 'rating_women', issue: 'Women\'s rating (' + ts.rating_women + ') is lower than men\'s (' + ts.rating_men + ') on the same tee — check this' });

    // Unlabelled rating warning
    if (ts.rating_unlabelled != null)
      warnings.push({ tee: ti, field: 'rating_unlabelled', issue: 'Card shows one rating for this tee. Which is it?' });

    for (let s = 1; s <= maxSI; s++) {
      if (!siSeen[s]) warnings.push({ tee: ti, field: 'stroke_index', issue: 'Missing SI ' + s });
    }
  });
  return warnings;
}

// Background function handler — Netlify calls this, returns 202 immediately,
// then this runs for up to 15 minutes.
export default async (req) => {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.error('Bad request body');
    return;
  }

  const readId = body.read_id;
  if (!readId) { console.error('Missing read_id'); return; }

  const start = Date.now();

  try {
    // Mark as processing
    await sbPatch('scorecard_reads?id=eq.' + readId, { status: 'processing' });

    // Fetch the read row to get photo_path
    const rows = await sbGet('scorecard_reads?id=eq.' + readId + '&select=photo_path&limit=1');
    if (!rows || !rows.length) throw new Error('Read row not found');
    const photoPath = rows[0].photo_path;

    // Fetch photo from storage
    const photoBuffer = await fetchPhoto(photoPath);
    const b64 = photoBuffer.toString('base64');
    console.log('Photo: ' + b64.length + ' b64 chars');

    // Call Claude
    const responseText = await callClaude(b64, 'image/jpeg');

    // Parse JSON
    const jsonText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let card;
    try {
      card = JSON.parse(jsonText);
    } catch (e) {
      const elapsed = Date.now() - start;
      await sbPatch('scorecard_reads?id=eq.' + readId, {
        status: 'failed',
        error_message: 'Could not read the scorecard clearly. Try a flatter, well-lit photo.',
        duration_ms: elapsed,
        completed_at: new Date().toISOString()
      });
      return;
    }

    // Validate
    const warnings = validate(card);
    const elapsed = Date.now() - start;

    // Write result
    await sbPatch('scorecard_reads?id=eq.' + readId, {
      status: 'done',
      result: JSON.stringify(card),
      warnings: JSON.stringify(warnings),
      duration_ms: elapsed,
      completed_at: new Date().toISOString()
    });

    console.log('Read ' + readId + ' done in ' + (elapsed / 1000).toFixed(1) + 's, ' +
      (card.tee_sets || []).length + ' tee sets, ' + warnings.length + ' warnings');

  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('Read ' + readId + ' failed:', err.message);
    try {
      await sbPatch('scorecard_reads?id=eq.' + readId, {
        status: 'failed',
        error_message: 'Something went wrong reading the card. Try again or add by hand.',
        duration_ms: elapsed,
        completed_at: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to update read row:', e.message); }
  }
};

export const config = { path: '/api/course-from-photo-background' };
