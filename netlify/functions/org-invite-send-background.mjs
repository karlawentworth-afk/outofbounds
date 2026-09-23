// Background function — sends queued invite emails via Resend at 10/sec.
// Triggered by org-invite-send.js. Runs up to 15 minutes.

// Inline Resend call (no SDK needed for a single POST)
async function sendEmail(params) {
  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  var data = await res.json();
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (data.message || JSON.stringify(data)));
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async (req) => {
  var body;
  try { body = await req.json(); } catch (e) { return new Response('Invalid JSON', { status: 400 }); }

  var { organiser_id, event_id } = body;
  if (!organiser_id || !event_id) {
    return new Response('Missing organiser_id or event_id', { status: 400 });
  }

  // Use REST directly with service key
  var SB_URL = process.env.SUPABASE_URL || 'https://ahutmswadskdkqhnrhhh.supabase.co';
  var SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  var headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json'
  };

  async function sbGet(path) {
    var res = await fetch(SB_URL + '/rest/v1/' + path, { headers: headers });
    return res.json();
  }
  async function sbPatch(path, body) {
    var h = Object.assign({}, headers, { 'Prefer': 'return=representation' });
    var res = await fetch(SB_URL + '/rest/v1/' + path, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
    return res.json();
  }

  try {
    // Fetch queued rows for this event
    var queued = await sbGet(
      'send_log?event_id=eq.' + event_id +
      '&organiser_id=eq.' + organiser_id +
      '&status=eq.queued' +
      '&select=id,person_id'
    );

    if (!queued || queued.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Fetch organiser branding
    var orgs = await sbGet(
      'organisers?id=eq.' + organiser_id +
      '&select=name,display_name,logo_url,contact_email'
    );
    var org = (orgs && orgs[0]) || {};
    var orgName = org.display_name || org.name || 'Your organiser';
    var replyTo = org.contact_email || undefined;

    // Fetch event details
    var events = await sbGet(
      'events?id=eq.' + event_id +
      '&select=name,event_date,slug,organiser_id'
    );
    var ev = (events && events[0]) || {};

    // Fetch organiser slug for URLs
    var orgSlugs = await sbGet(
      'organisers?id=eq.' + organiser_id + '&select=slug'
    );
    var orgSlug = (orgSlugs && orgSlugs[0] && orgSlugs[0].slug) || '';

    // Fetch person details for all queued rows
    var personIds = queued.map(q => q.person_id);
    var uniqueIds = [...new Set(personIds)];

    // Fetch in batches
    var people = {};
    for (var i = 0; i < uniqueIds.length; i += 50) {
      var batch = uniqueIds.slice(i, i + 50);
      var filter = 'people?id=in.(' + batch.join(',') + ')&select=id,first_name,last_name,email,remove_token';
      var result = await sbGet(filter);
      (result || []).forEach(p => { people[p.id] = p; });
    }

    // Fetch player tokens for this event
    var players = await sbGet(
      'players?event_id=eq.' + event_id + '&select=email,player_token'
    );
    var tokenByEmail = {};
    (players || []).forEach(p => { if (p.email) tokenByEmail[p.email.toLowerCase()] = p.player_token; });

    var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';
    var fromAddr = process.env.RESEND_FROM || 'noreply@outofboundsevents.com';
    var sent = 0;

    for (var j = 0; j < queued.length; j++) {
      var logRow = queued[j];
      var person = people[logRow.person_id];

      if (!person || !person.email) {
        await sbPatch('send_log?id=eq.' + logRow.id, { status: 'failed', sent_at: new Date().toISOString() });
        continue;
      }

      // Build the personal link
      var playerToken = tokenByEmail[person.email.toLowerCase()];
      var personalLink = playerToken
        ? baseUrl + '/p/#/' + orgSlug + '/' + ev.slug + '/' + playerToken
        : baseUrl + '/p/#/' + orgSlug + '/' + ev.slug;

      var removeLink = baseUrl + '/.netlify/functions/people-remove?token=' + person.remove_token;

      var eventDate = ev.event_date
        ? new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : '';

      var htmlBody = '<div style="max-width:560px;margin:0 auto;font-family:sans-serif;">';
      if (org.logo_url) {
        htmlBody += '<div style="text-align:center;padding:20px 0;"><img src="' + org.logo_url + '" alt="' + orgName + '" style="max-height:48px;"></div>';
      }
      htmlBody += '<h2 style="margin:0 0 8px;">' + orgName + '</h2>';
      htmlBody += '<p>You\'re playing in <strong>' + (ev.name || 'an event') + '</strong>';
      if (eventDate) htmlBody += ' on ' + eventDate;
      htmlBody += '.</p>';
      htmlBody += '<p><a href="' + personalLink + '" style="display:inline-block;padding:12px 28px;background:#2F7A45;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Open your scorecard</a></p>';
      htmlBody += '<p style="font-size:13px;color:#666;margin-top:24px;">' + orgName + ' keeps your name, email and handicap so they can invite you to future events. Ask them to remove you at any time, or <a href="' + removeLink + '">remove me</a>.</p>';
      htmlBody += '<p style="font-size:11px;color:#999;margin-top:16px;">Scored with Out of Bounds</p>';
      htmlBody += '</div>';

      try {
        var emailResult = await sendEmail({
          from: orgName + ' via Out of Bounds <' + fromAddr + '>',
          to: [person.email],
          reply_to: replyTo,
          subject: 'Your scorecard for ' + (ev.name || 'the event'),
          html: htmlBody
        });

        await sbPatch('send_log?id=eq.' + logRow.id, {
          status: 'sent',
          resend_id: emailResult.id || null,
          sent_at: new Date().toISOString()
        });

        sent++;
      } catch (err) {
        console.error('Send failed for ' + person.email + ':', err.message);
        await sbPatch('send_log?id=eq.' + logRow.id, {
          status: 'failed',
          sent_at: new Date().toISOString()
        });
      }

      // Rate limit: 10 per second
      if ((j + 1) % 10 === 0) {
        await sleep(1000);
      }
    }

    return new Response(JSON.stringify({ sent: sent, total: queued.length }), { status: 200 });
  } catch (err) {
    console.error('org-invite-send-background error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export var config = { path: '/.netlify/functions/org-invite-send-background' };
