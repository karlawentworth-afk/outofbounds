'use strict';

var sb = require('./shared/supabase');

/**
 * Reset the demo organiser: delete all data and re-run the seed.
 * Called from /o/admin "Reset demo" button and nightly at 03:00 UK.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  // Accept POST (manual) or scheduled invocation
  var body = {};
  if (event.httpMethod === 'POST' && event.body) {
    try { body = JSON.parse(event.body); } catch (e) {}
  }

  // If called manually, verify superadmin
  if (body.organiser_id) {
    var orgs = await sb.sbGet(
      'organisers?id=eq.' + body.organiser_id +
      '&select=is_superadmin&limit=1'
    );
    if (!orgs || !orgs.length || !orgs[0].is_superadmin) {
      return sb.respond(403, { error: 'Not authorised' });
    }
  }

  try {
    // Run the seed script inline (same logic)
    // We re-implement the delete + create here to avoid shelling out

    var DEMO_SLUG = 'demo';
    var existingOrgs = await sb.sbGet('organisers?slug=eq.' + DEMO_SLUG + '&select=id');

    if (existingOrgs && existingOrgs.length) {
      var oldId = existingOrgs[0].id;

      // Delete in FK order
      var oldEvents = await sb.sbGet('events?organiser_id=eq.' + oldId + '&select=id');
      for (var i = 0; i < (oldEvents || []).length; i++) {
        var eid = oldEvents[i].id;
        await sb.sbDelete('hole_scores?event_id=eq.' + eid);
        await sb.sbDelete('score_edits?event_id=eq.' + eid);
        await sb.sbDelete('send_log?event_id=eq.' + eid);
        await sb.sbDelete('payments?event_id=eq.' + eid);
        await sb.sbDelete('players?event_id=eq.' + eid);
        await sb.sbDelete('groups?event_id=eq.' + eid);
      }
      await sb.sbDelete('events?organiser_id=eq.' + oldId);
      await sb.sbDelete('people?organiser_id=eq.' + oldId);
      await sb.sbDelete('plan_events?organiser_id=eq.' + oldId);
      await sb.sbDelete('branding_versions?organiser_id=eq.' + oldId);

      // Reset the organiser row (don't delete — keep the ID stable)
      await sb.sbPatch('organisers?id=eq.' + oldId, {
        name: 'Fairway Events',
        display_name: 'Fairway Events',
        logo_url: '/img/fairway-logo.svg',
        primary_colour: '#1A7A3A',
        accent_colour: '#E67E22',
        text_on_primary: '#FFFFFF',
        plan: 'pro',
        plan_source: 'comp',
        comp_until: '2099-12-31T23:59:59Z'
      });

      console.log('Demo data deleted for ' + oldId);
    }

    // Trigger background function to re-seed
    var https = require('https');
    var bgUrl = (process.env.APP_BASE_URL || 'https://score.outofboundsevents.com') +
      '/.netlify/functions/demo-reset-background';
    var bgReq = https.request(bgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    bgReq.on('error', function () {});
    bgReq.write('{}');
    bgReq.end();

    return sb.respond(200, {
      ok: true,
      message: 'Demo data cleared. Re-seeding in background.'
    });
  } catch (err) {
    console.error('demo-reset error:', err);
    return sb.respond(500, { error: err.message });
  }
};
