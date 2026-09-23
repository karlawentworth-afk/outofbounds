'use strict';

var sb = require('./shared/supabase');

/**
 * Public series standings endpoint.
 * GET ?org=<slug>&series=<slug>
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'GET') return sb.respond(405, { error: 'Method not allowed' });

  var qs = event.queryStringParameters || {};
  if (!qs.org || !qs.series) return sb.respond(400, { error: 'Missing org or series' });

  try {
    var orgs = await sb.sbGet(
      'organisers?slug=eq.' + encodeURIComponent(qs.org) + '&select=id,name,display_name&limit=1'
    );
    if (!orgs || !orgs.length) return sb.respond(404, { error: 'Organiser not found' });
    var org = orgs[0];

    var allSeries = await sb.sbGet(
      'series?organiser_id=eq.' + org.id + '&slug=eq.' + encodeURIComponent(qs.series) + '&select=*&limit=1'
    );
    if (!allSeries || !allSeries.length) return sb.respond(404, { error: 'Series not found' });
    var s = allSeries[0];

    // Use the same standings logic as org-series GET with series_id
    var events = await sb.sbGet(
      'events?series_id=eq.' + s.id + '&status=eq.finished&select=id,name,event_date&order=event_date.asc'
    );

    var playerPoints = {};
    for (var ei = 0; ei < (events || []).length; ei++) {
      var evId = events[ei].id;
      var scores = await sb.sbGet('hole_scores?event_id=eq.' + evId + '&select=player_id,hole_number,gross_score');
      var players = await sb.sbGet('players?event_id=eq.' + evId + '&select=id,display_name,playing_handicap');
      var evData = await sb.sbGet('events?id=eq.' + evId + '&select=course_id');
      var courseId = evData && evData[0] ? evData[0].course_id : null;
      var courseHoles = courseId ? await sb.sbGet('course_holes?course_id=eq.' + courseId + '&select=hole_number,par,stroke_index&order=hole_number.asc') : [];

      (players || []).forEach(function (p) {
        var pts = 0;
        var ph = p.playing_handicap || 0;
        (scores || []).filter(function (sc) { return sc.player_id === p.id; }).forEach(function (sc) {
          var hole = (courseHoles || []).find(function (h) { return h.hole_number === sc.hole_number; });
          if (!hole) return;
          var strokes = hole.stroke_index <= ph ? 1 : 0;
          if (ph > 18 && hole.stroke_index <= (ph - 18)) strokes = 2;
          var nett = sc.gross_score - strokes;
          pts += Math.max(0, 2 - (nett - hole.par));
        });
        var name = p.display_name;
        if (!playerPoints[name]) playerPoints[name] = [];
        playerPoints[name].push(pts);
      });
    }

    var bestOf = s.best_of || 5;
    var standings = Object.keys(playerPoints).map(function (name) {
      var all = playerPoints[name].sort(function (a, b) { return b - a; });
      var best = all.slice(0, bestOf);
      return { name: name, total: best.reduce(function (a, b) { return a + b; }, 0), results: all.length, best: best };
    }).sort(function (a, b) { return b.total - a.total; });

    return sb.respond(200, {
      series: { name: s.name, best_of: s.best_of },
      organiser: { name: org.display_name || org.name },
      events: events || [],
      standings: standings
    });
  } catch (err) {
    console.error('series-standings error:', err);
    return sb.respond(500, { error: err.message });
  }
};
