// Background function — runs up to 15 minutes, returns 202 immediately.
// Two-pass scorecard reader: layout first, then extraction.

import https from 'https';

const SB_HOST = 'ahutmswadskdkqhnrhhh.supabase.co';
const ANTHROPIC_HOST = 'api.anthropic.com';

function sbRequest(method, path, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': key, 'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json', 'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({ hostname: SB_HOST, port: 443, path: '/rest/v1/' + path, method, headers }, res => {
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
      path: '/storage/v1/object/scorecards/' + path, method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('Storage ' + res.statusCode)); return; }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function callClaude(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: messages
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
        if (res.statusCode !== 200) { reject(new Error('Anthropic ' + res.statusCode + ': ' + raw.slice(0, 300))); return; }
        try {
          const parsed = JSON.parse(raw);
          let text = '';
          (parsed.content || []).forEach(b => { if (b.type === 'text') text += b.text; });
          resolve(text);
        } catch (e) { reject(new Error('Bad Anthropic response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseJSON(text) {
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(clean);
}

// ── PASS 1: Layout ──────────────────────────────────────────────
const PASS1_PROMPT = `You are analysing a golf club scorecard photograph.
Return ONLY valid JSON, no markdown fences, no explanation.

Describe the LAYOUT of this card:
{
  "orientation": "portrait" | "landscape_fold",
  "tee_colours": ["Blue", "White", "Yellow", "Red", "Green"],
  "tee_colours_order": "top_to_bottom",
  "par_si_style": "per_tee_column" | "shared_rows",
  "par_si_detail": "explain: does each tee colour have its own par/SI column, or are there shared 'Men\\'s Par', 'Men\\'s SI', 'Women\\'s Par', 'Women\\'s SI' rows that apply to ALL tees?",
  "rating_boxes": {
    "men": {
      "label": "what the box is labelled, e.g. '(M) Course Ratings'",
      "columns_count": number,
      "columns_filled": ["which tee colours have a value, left to right by colour swatch"],
      "columns_empty": ["which tee colours are blank"]
    },
    "women": {
      "label": "e.g. '(W) Course Ratings'",
      "columns_count": number,
      "columns_filled": ["which tee colours have a value"],
      "columns_empty": ["which tee colours are blank"]
    }
  },
  "holes_visible": "1-18" | "1-9" | "10-18",
  "unclear": ["list anything hard to read: shadows, glare, cut off edges"]
}

Rules:
- tee_colours: list every tee colour row visible, in order from top to bottom.
- par_si_style: "per_tee_column" if each tee row has its own par and SI column (like Carden Park). "shared_rows" if there are separate labelled rows like "Men's Par", "Men's SI", "Women's Par", "Women's SI" that apply across all tees.
- rating_boxes: the small box(es) at the bottom showing Course Rating and Slope. They have one column per tee colour, matched by colour swatch position. Some columns may be blank. List which are filled and which are empty BY COLOUR, not by compacting.
- landscape_fold means holes 1-9 on one side, 10-18 on the other, visible together.`;

// ── PASS 2: Extraction ──────────────────────────────────────────
function makePass2Prompt(layout) {
  const style = layout.par_si_style;
  const colours = (layout.tee_colours || []).join(', ');
  const menFilled = (layout.rating_boxes && layout.rating_boxes.men && layout.rating_boxes.men.columns_filled) || [];
  const womenFilled = (layout.rating_boxes && layout.rating_boxes.women && layout.rating_boxes.women.columns_filled) || [];

  return `You are extracting data from a golf scorecard photograph.
The layout analysis says:
- Tee colours (top to bottom): ${colours}
- Par/SI style: ${style}
- Men's ratings exist for: ${menFilled.join(', ') || 'unknown'}
- Women's ratings exist for: ${womenFilled.join(', ') || 'unknown'}

Return ONLY valid JSON, no markdown fences:
{
  "tees": [
    {
      "colour": "Blue",
      "yards": [yard1, yard2, ... yard18],
      "yards_out": number, "yards_in": number, "yards_total": number,
      "rating_men": number or null, "slope_men": number or null,
      "rating_women": number or null, "slope_women": number or null
    }
  ],
  "par_si": [
    {
      "label": "men" | "women",
      "pars": [par1, par2, ... par18],
      "pars_out": number, "pars_in": number, "pars_total": number,
      "sis": [si1, si2, ... si18],
      "confidence": 0-1,
      "check_holes": [hole numbers where read was unsure]
    }
  ]
}

CRITICAL RULES:
1. RATINGS: Read the rating/slope boxes POSITIONALLY by colour swatch column.
   The men's box (M) has ${(layout.rating_boxes && layout.rating_boxes.men && layout.rating_boxes.men.columns_count) || '?'} columns, one per tee colour in order: ${colours}.
   The women's box (W) has ${(layout.rating_boxes && layout.rating_boxes.women && layout.rating_boxes.women.columns_count) || '?'} columns, same order.
   If a column is BLANK for a tee colour, return null — do NOT slide values left.
   Blue and White have no women's rating on this card = null.

2. PAR AND SI:
${style === 'shared_rows' ?
  `   This card has SHARED par/SI rows labelled "Men's Par", "Men's SI", "Women's Par", "Women's SI".
   These apply to ALL tees. Return them in par_si as two entries: one for "men", one for "women".
   Do NOT duplicate them per tee. The pars and SIs are the SAME for every tee colour within a gender.` :
  `   Each tee has its own par and SI columns. Return one par_si entry per tee.`}

3. YARDS: One row per tee colour. Read the printed yard values for all 18 holes.
   If a tee colour's yards appear twice on the card (e.g. Red printed in both men's and women's sections), it is ONE tee — use either row, they are the same.

4. stroke_index is the SI/handicap column, NOT the hole number. Values must be exactly 1-18 each used once.
5. par is always 3, 4, 5, or rarely 6.
6. Read the printed OUT, IN and TOTAL sums and return them so we can cross-check.
7. Return null for anything not legible. Never guess.`;
}

// ── Validation ──────────────────────────────────────────────────
function validate(result) {
  const warnings = [];

  // Validate par_si entries
  (result.par_si || []).forEach((ps, pi) => {
    const pars = ps.pars || [];
    const sis = ps.sis || [];
    const n = pars.length;
    const label = ps.label || 'entry ' + pi;

    if (n !== 9 && n !== 18)
      warnings.push({ par_si: pi, issue: label + ': expected 9 or 18 holes, got ' + n });

    // Par range
    pars.forEach((p, hi) => {
      if (p != null && (p < 3 || p > 6))
        warnings.push({ par_si: pi, hole: hi + 1, field: 'par', value: p, issue: label + ': par must be 3-6' });
    });

    // Par sums
    const parSum = pars.reduce((s, p) => s + (p || 0), 0);
    if (ps.pars_total != null && parSum > 0 && ps.pars_total !== parSum)
      warnings.push({ par_si: pi, field: 'pars_total', issue: label + ': par total ' + ps.pars_total + ' does not match sum ' + parSum });
    const outSum = pars.slice(0, 9).reduce((s, p) => s + (p || 0), 0);
    if (ps.pars_out != null && outSum > 0 && ps.pars_out !== outSum)
      warnings.push({ par_si: pi, field: 'pars_out', issue: label + ': OUT pars ' + ps.pars_out + ' does not match sum ' + outSum });
    const inSum = pars.slice(9).reduce((s, p) => s + (p || 0), 0);
    if (ps.pars_in != null && inSum > 0 && ps.pars_in !== inSum)
      warnings.push({ par_si: pi, field: 'pars_in', issue: label + ': IN pars ' + ps.pars_in + ' does not match sum ' + inSum });

    // SI uniqueness
    const siSeen = {};
    const maxSI = n || 18;
    sis.forEach((si, hi) => {
      if (si != null) {
        if (si < 1 || si > maxSI)
          warnings.push({ par_si: pi, hole: hi + 1, field: 'si', value: si, issue: label + ': SI must be 1-' + maxSI });
        if (siSeen[si])
          warnings.push({ par_si: pi, hole: hi + 1, field: 'si', value: si, issue: label + ': duplicate SI' });
        siSeen[si] = true;
      }
    });
    for (let s = 1; s <= maxSI; s++) {
      if (!siSeen[s]) warnings.push({ par_si: pi, field: 'si', issue: label + ': missing SI ' + s });
    }
  });

  // Validate tees
  (result.tees || []).forEach((tee, ti) => {
    // Yard sums
    const yards = tee.yards || [];
    const yardSum = yards.reduce((s, y) => s + (y || 0), 0);
    if (tee.yards_total != null && yardSum > 0 && Math.abs(tee.yards_total - yardSum) > 2)
      warnings.push({ tee: ti, field: 'yards_total', issue: tee.colour + ': yard total ' + tee.yards_total + ' does not match sum ' + yardSum });

    // Rating range checks
    ['rating_men', 'rating_women'].forEach(f => {
      if (tee[f] != null && (tee[f] < 50 || tee[f] > 85))
        warnings.push({ tee: ti, field: f, value: tee[f], issue: tee.colour + ': ' + f + ' should be 50-85' });
    });
    ['slope_men', 'slope_women'].forEach(f => {
      if (tee[f] != null && (tee[f] < 55 || tee[f] > 155))
        warnings.push({ tee: ti, field: f, value: tee[f], issue: tee.colour + ': ' + f + ' should be 55-155' });
    });

    // Women's rating lower than men's = likely misread
    if (tee.rating_women != null && tee.rating_men != null && tee.rating_women < tee.rating_men)
      warnings.push({ tee: ti, issue: tee.colour + ': women\'s rating (' + tee.rating_women + ') lower than men\'s (' + tee.rating_men + ') — check this' });
  });

  // Check filled rating column count matches tee count
  const teesWithMenRating = (result.tees || []).filter(t => t.rating_men != null).length;
  const teesWithWomenRating = (result.tees || []).filter(t => t.rating_women != null).length;
  if (teesWithMenRating === 0)
    warnings.push({ issue: 'No men\'s ratings found on any tee' });

  return warnings;
}

// ── Main handler ────────────────────────────────────────────────
export default async (req) => {
  let body;
  try { body = await req.json(); } catch (e) { console.error('Bad body'); return; }
  const readId = body.read_id;
  if (!readId) { console.error('Missing read_id'); return; }

  const start = Date.now();

  try {
    await sbPatch('scorecard_reads?id=eq.' + readId, { status: 'processing' });

    const rows = await sbGet('scorecard_reads?id=eq.' + readId + '&select=photo_path&limit=1');
    if (!rows || !rows.length) throw new Error('Read row not found');

    const photoBuffer = await fetchPhoto(rows[0].photo_path);
    const b64 = photoBuffer.toString('base64');
    console.log('Photo: ' + b64.length + ' b64 chars');

    const imageBlock = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } };

    // ── PASS 1: Layout ────────────────────────────────────────
    console.log('Pass 1: layout...');
    const layoutText = await callClaude([{
      role: 'user',
      content: [imageBlock, { type: 'text', text: PASS1_PROMPT }]
    }]);
    let layout;
    try { layout = parseJSON(layoutText); }
    catch (e) { throw new Error('Pass 1 failed to parse: ' + layoutText.slice(0, 200)); }
    console.log('Layout:', JSON.stringify(layout).slice(0, 300));

    // ── PASS 2: Extraction ────────────────────────────────────
    console.log('Pass 2: extraction...');
    const extractPrompt = makePass2Prompt(layout);
    const extractText = await callClaude([{
      role: 'user',
      content: [imageBlock, { type: 'text', text: extractPrompt }]
    }]);
    let result;
    try { result = parseJSON(extractText); }
    catch (e) { throw new Error('Pass 2 failed to parse: ' + extractText.slice(0, 200)); }

    // Validate
    const warnings = validate(result);
    const elapsed = Date.now() - start;

    // Write result
    await sbPatch('scorecard_reads?id=eq.' + readId, {
      status: 'done',
      result: JSON.stringify(result),
      warnings: JSON.stringify(warnings),
      duration_ms: elapsed,
      completed_at: new Date().toISOString()
    });

    console.log('Read ' + readId + ' done in ' + (elapsed / 1000).toFixed(1) + 's, ' +
      (result.tees || []).length + ' tees, ' + (result.par_si || []).length + ' par/si sets, ' +
      warnings.length + ' warnings');

  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('Read ' + readId + ' failed:', err.message);
    try {
      await sbPatch('scorecard_reads?id=eq.' + readId, {
        status: 'failed',
        error_message: err.message.indexOf('TIMEOUT') !== -1
          ? 'Reading the card took too long. Try a clearer, well-lit photo.'
          : 'Something went wrong reading the card. Try again or add by hand.',
        duration_ms: elapsed,
        completed_at: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to update row:', e.message); }
  }
};

export const config = { path: '/api/course-from-photo-background' };
