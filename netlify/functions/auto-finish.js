'use strict';

var sb = require('./shared/supabase');

/**
 * Scheduled: auto-finish live events at 23:59 the day after event_date.
 * Counts only holes that every player has scored.
 * Sets auto_closed=true, emails the organiser.
 */
exports.handler = async function () {
  try {
    // Find live events whose event_date is yesterday or earlier
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    var cutoffDate = cutoff.toISOString().slice(0, 10);

    var events = await sb.sbGet(
      'events?status=eq.live' +
      '&event_date=lte.' + cutoffDate +
      '&select=id,name,organiser_id,event_date'
    );

    if (!events || events.length === 0) {
      console.log('auto-finish: no events to close');
      return { statusCode: 200, body: JSON.stringify({ closed: 0 }) };
    }

    var closed = 0;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];

      // Find the highest hole number that ALL players have scored
      var scores = await sb.sbGet(
        'hole_scores?event_id=eq.' + ev.id +
        '&select=player_id,hole_number'
      );
      var players = await sb.sbGet(
        'players?event_id=eq.' + ev.id +
        '&select=id'
      );

      if (!players || players.length === 0) continue;

      var playerCount = players.length;
      var holeCounts = {}; // { holeNumber: count of players with a score }

      (scores || []).forEach(function (s) {
        holeCounts[s.hole_number] = (holeCounts[s.hole_number] || 0) + 1;
      });

      // Find highest hole where everyone has scored
      var countedHoles = 0;
      for (var h = 1; h <= 18; h++) {
        if ((holeCounts[h] || 0) >= playerCount) {
          countedHoles = h;
        } else {
          break;
        }
      }

      if (countedHoles === 0) countedHoles = 1; // At least hole 1

      await sb.sbPatch('events?id=eq.' + ev.id, {
        status: 'finished',
        locked_at: new Date().toISOString(),
        results_published: true,
        results_published_at: new Date().toISOString(),
        counted_holes: countedHoles,
        auto_closed: true
      });

      // Email the organiser
      var orgs = await sb.sbGet(
        'organisers?id=eq.' + ev.organiser_id +
        '&select=name,contact_email&limit=1'
      );
      var org = (orgs && orgs[0]) || {};

      if (org.contact_email && process.env.RESEND_API_KEY) {
        var baseUrl = process.env.APP_BASE_URL || 'https://score.outofboundsevents.com';
        var orgSlugs = await sb.sbGet('organisers?id=eq.' + ev.organiser_id + '&select=slug&limit=1');
        var orgSlug = (orgSlugs && orgSlugs[0]) ? orgSlugs[0].slug : '';
        var evSlugs = await sb.sbGet('events?id=eq.' + ev.id + '&select=slug&limit=1');
        var evSlug = (evSlugs && evSlugs[0]) ? evSlugs[0].slug : '';

        var resultsUrl = baseUrl + '/r/' + orgSlug + '/' + evSlug;
        var changeUrl = baseUrl + '/o/#event-' + ev.id;

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Out of Bounds <' + (process.env.RESEND_FROM || 'noreply@outofboundsevents.com') + '>',
              to: [org.contact_email],
              subject: ev.name + ' — closed automatically',
              html: '<p>Hi ' + (org.name || '') + ',</p>' +
                '<p><strong>' + ev.name + '</strong> was closed automatically because it passed its event date.</p>' +
                '<p>Results count holes 1 to ' + countedHoles + ' (the last hole everyone completed).</p>' +
                '<p><a href="' + resultsUrl + '">View results</a> · <a href="' + changeUrl + '">Make changes</a></p>' +
                '<p style="color:#666;font-size:13px;">You can edit scores and change the counted holes from the event page.</p>'
            })
          });
        } catch (emailErr) {
          console.error('auto-finish email error for event ' + ev.id + ':', emailErr.message);
        }
      }

      closed++;
      console.log('auto-finish: closed ' + ev.name + ' (counted_holes=' + countedHoles + ')');
    }

    return { statusCode: 200, body: JSON.stringify({ closed: closed }) };
  } catch (err) {
    console.error('auto-finish error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
