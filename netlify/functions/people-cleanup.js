'use strict';

var sb = require('./shared/supabase');

/**
 * Scheduled monthly cleanup of stale people records.
 *
 * Pass 1: People with no event in 23 months and no cleanup_warned_at
 *         → set cleanup_warned_at, email organiser.
 * Pass 2: People with cleanup_warned_at >= 28 days ago and no event in 24 months
 *         → soft delete.
 */
exports.handler = async function () {
  var now = new Date();
  var twentyThreeMonthsAgo = new Date(now);
  twentyThreeMonthsAgo.setMonth(twentyThreeMonthsAgo.getMonth() - 23);

  var twentyFourMonthsAgo = new Date(now);
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

  var twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  try {
    // Pass 1: Warn people with no event in 23 months (not already warned)
    var toWarn = await sb.sbGet(
      'people?deleted_at=is.null' +
      '&cleanup_warned_at=is.null' +
      '&last_event_at=lt.' + twentyThreeMonthsAgo.toISOString() +
      '&select=id,organiser_id,first_name,last_name'
    );

    // Also include people who were never in an event
    var neverPlayed = await sb.sbGet(
      'people?deleted_at=is.null' +
      '&cleanup_warned_at=is.null' +
      '&last_event_at=is.null' +
      '&created_at=lt.' + twentyThreeMonthsAgo.toISOString() +
      '&select=id,organiser_id,first_name,last_name'
    );

    var allToWarn = (toWarn || []).concat(neverPlayed || []);
    var warned = 0;

    if (allToWarn.length > 0) {
      // Group by organiser
      var byOrg = {};
      allToWarn.forEach(function (p) {
        if (!byOrg[p.organiser_id]) byOrg[p.organiser_id] = [];
        byOrg[p.organiser_id].push(p);
      });

      for (var orgId in byOrg) {
        var people = byOrg[orgId];
        var ids = people.map(function (p) { return p.id; });

        // Set warned
        for (var i = 0; i < ids.length; i++) {
          await sb.sbPatch('people?id=eq.' + ids[i], {
            cleanup_warned_at: now.toISOString()
          });
          warned++;
        }

        // Email organiser
        var orgs = await sb.sbGet('organisers?id=eq.' + orgId + '&select=contact_email,name&limit=1');
        var org = (orgs && orgs[0]) || {};

        if (org.contact_email && process.env.RESEND_API_KEY) {
          var names = people.slice(0, 10).map(function (p) { return p.first_name + ' ' + p.last_name; });
          var more = people.length > 10 ? ' and ' + (people.length - 10) + ' more' : '';

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
                subject: people.length + ' people will be removed in one month',
                html: '<p>Hi ' + (org.name || '') + ',</p>' +
                  '<p>The following people haven\'t been in one of your events for nearly two years and will be removed in one month:</p>' +
                  '<p><strong>' + names.join(', ') + more + '</strong></p>' +
                  '<p>If you want to keep them, add them to an event before then. Otherwise, no action needed.</p>' +
                  '<p style="color:#666;font-size:13px;">Out of Bounds automatically removes people who haven\'t played in 24 months.</p>'
              })
            });
          } catch (emailErr) {
            console.error('Cleanup warn email failed for org ' + orgId + ':', emailErr.message);
          }
        }
      }
    }

    // Pass 2: Delete people warned at least 28 days ago with no event in 24 months
    var toDelete = await sb.sbGet(
      'people?deleted_at=is.null' +
      '&cleanup_warned_at=lt.' + twentyEightDaysAgo.toISOString() +
      '&last_event_at=lt.' + twentyFourMonthsAgo.toISOString() +
      '&select=id'
    );

    var alsoDelete = await sb.sbGet(
      'people?deleted_at=is.null' +
      '&cleanup_warned_at=lt.' + twentyEightDaysAgo.toISOString() +
      '&last_event_at=is.null' +
      '&created_at=lt.' + twentyFourMonthsAgo.toISOString() +
      '&select=id'
    );

    var allToDelete = (toDelete || []).concat(alsoDelete || []);
    var deleted = 0;

    for (var j = 0; j < allToDelete.length; j++) {
      await sb.sbPatch('people?id=eq.' + allToDelete[j].id, {
        deleted_at: now.toISOString()
      });
      deleted++;
    }

    console.log('People cleanup: warned=' + warned + ' deleted=' + deleted);
    return { statusCode: 200, body: JSON.stringify({ warned: warned, deleted: deleted }) };
  } catch (err) {
    console.error('people-cleanup error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
