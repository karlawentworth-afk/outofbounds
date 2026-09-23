'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }
  if (event.httpMethod !== 'GET') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var qs = event.queryStringParameters || {};
  var orgSlug = qs.org;
  var eventSlug = qs.event;

  if (!orgSlug) {
    return sb.respond(400, { error: 'Missing required query param: org' });
  }

  try {
    // Look up organiser by slug
    var orgs = await sb.sbGet(
      'organisers?slug=eq.' + encodeURIComponent(orgSlug) +
      '&select=id,name,logo_url,logo_dark_url,primary_colour,secondary_colour,accent_colour,text_on_primary,display_name,plan' +
      '&limit=1'
    );

    if (!orgs || orgs.length === 0) {
      return sb.respond(404, { error: 'Organiser not found' });
    }

    var org = orgs[0];
    var stripeKey = process.env.STRIPE_SECRET_KEY || '';
    var testMode = stripeKey.indexOf('sk_test_') === 0;

    var result = {
      organiser: {
        id: org.id,
        name: org.name,
        logo_url: org.logo_url,
        logo_dark_url: org.logo_dark_url,
        primary_colour: org.primary_colour,
        secondary_colour: org.secondary_colour,
        accent_colour: org.accent_colour,
        text_on_primary: org.text_on_primary,
        display_name: org.display_name,
        plan: org.plan
      },
      test_mode: testMode
    };

    // If event slug provided, also return event summary
    if (eventSlug) {
      var events = await sb.sbGet(
        'events?organiser_id=eq.' + org.id +
        '&slug=eq.' + encodeURIComponent(eventSlug) +
        '&select=id,name,event_date,format,handicap_allowance,sponsor_name,sponsor_logo_url,headline_text,status,board_rows_per_page,leaderboard_freeze_hole,board_show_full' +
        '&limit=1'
      );

      if (!events || events.length === 0) {
        return sb.respond(404, { error: 'Event not found' });
      }

      var ev = events[0];
      result.event = {
        id: ev.id,
        name: ev.name,
        event_date: ev.event_date,
        format: ev.format,
        handicap_allowance: ev.handicap_allowance,
        sponsor_name: ev.sponsor_name,
        sponsor_logo_url: ev.sponsor_logo_url,
        headline_text: ev.headline_text,
        status: ev.status,
        board_rows_per_page: ev.board_rows_per_page,
        leaderboard_freeze_hole: ev.leaderboard_freeze_hole,
        board_show_full: ev.board_show_full
      };
    }

    return sb.respond(200, result);
  } catch (err) {
    console.error('config-get error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
