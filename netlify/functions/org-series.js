'use strict';

var sb = require('./shared/supabase');
var planGate = require('./shared/plan-gate');

function makeSlug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // GET: list series or get one with standings
  if (event.httpMethod === 'GET') {
    var orgId = qs.organiser_id;
    if (!orgId) return sb.respond(400, { error: 'Missing organiser_id' });

    try {
      await planGate.assertPro(orgId);
    } catch (e) { return sb.respond(e.status || 403, { error: e.error || 'Pro feature' }); }

    try {
      if (qs.series_id) {
        // Get single series with its events and standings
        var series = await sb.sbGet(
          'series?id=eq.' + qs.series_id + '&organiser_id=eq.' + orgId + '&select=*&limit=1'
        );
        if (!series || !series.length) return sb.respond(404, { error: 'Series not found' });

        var s = series[0];
        var events = await sb.sbGet(
          'events?series_id=eq.' + s.id + '&status=eq.finished&select=id,name,event_date&order=event_date.asc'
        );

        // Build order of merit: for each event, get top points per player
        var playerPoints = {}; // { playerName: [points, points, ...] }
        for (var ei = 0; ei < (events || []).length; ei++) {
          var evId = events[ei].id;
          // Get leaderboard entries
          var scores = await sb.sbGet(
            'hole_scores?event_id=eq.' + evId + '&select=player_id,hole_number,gross_score'
          );
          var players = await sb.sbGet(
            'players?event_id=eq.' + evId + '&select=id,display_name,playing_handicap'
          );
          var holes = await sb.sbGet(
            'events?id=eq.' + evId + '&select=course_id'
          );
          var courseId = holes && holes[0] ? holes[0].course_id : null;
          var courseHoles = courseId ? await sb.sbGet(
            'course_holes?course_id=eq.' + courseId + '&select=hole_number,par,stroke_index&order=hole_number.asc'
          ) : [];

          // Calculate stableford points per player
          (players || []).forEach(function (p) {
            var pts = 0;
            var ph = p.playing_handicap || 0;
            (scores || []).filter(function (sc) { return sc.player_id === p.id; }).forEach(function (sc) {
              var hole = (courseHoles || []).find(function (h) { return h.hole_number === sc.hole_number; });
              if (!hole) return;
              var strokes = hole.stroke_index <= ph ? 1 : 0;
              if (ph > 18 && hole.stroke_index <= (ph - 18)) strokes = 2;
              var nett = sc.gross_score - strokes;
              var stab = Math.max(0, 2 - (nett - hole.par));
              pts += stab;
            });

            var name = p.display_name;
            if (!playerPoints[name]) playerPoints[name] = [];
            playerPoints[name].push(pts);
          });
        }

        // Best N results
        var bestOf = s.best_of || 5;
        var standings = Object.keys(playerPoints).map(function (name) {
          var all = playerPoints[name].sort(function (a, b) { return b - a; });
          var best = all.slice(0, bestOf);
          var total = best.reduce(function (a, b) { return a + b; }, 0);
          return { name: name, total: total, results: all.length, best: best };
        }).sort(function (a, b) { return b.total - a.total; });

        return sb.respond(200, { series: s, events: events || [], standings: standings });
      }

      // List all series
      var allSeries = await sb.sbGet(
        'series?organiser_id=eq.' + orgId + '&select=id,name,slug,best_of,created_at&order=created_at.desc'
      );
      return sb.respond(200, { series: allSeries || [] });
    } catch (err) {
      return sb.respond(500, { error: err.message });
    }
  }

  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.organiser_id) return sb.respond(400, { error: 'Missing organiser_id' });

  try {
    await planGate.assertPro(body.organiser_id);
  } catch (e) { return sb.respond(e.status || 403, { error: e.error || 'Pro feature' }); }

  try {
    var action = body.action;

    // Create series
    if (action === 'create') {
      if (!body.name) return sb.respond(400, { error: 'Missing name' });
      var created = await sb.sbPost('series', {
        organiser_id: body.organiser_id,
        name: body.name,
        slug: makeSlug(body.name) + '-' + Date.now().toString(36),
        best_of: body.best_of || 5
      });
      return sb.respond(200, { series: Array.isArray(created) ? created[0] : created });
    }

    // Add event to series
    if (action === 'add_event') {
      if (!body.event_id || !body.series_id) return sb.respond(400, { error: 'Missing event_id or series_id' });
      await sb.sbPatch('events?id=eq.' + body.event_id, { series_id: body.series_id });
      return sb.respond(200, { ok: true });
    }

    // Remove event from series
    if (action === 'remove_event') {
      if (!body.event_id) return sb.respond(400, { error: 'Missing event_id' });
      await sb.sbPatch('events?id=eq.' + body.event_id, { series_id: null });
      return sb.respond(200, { ok: true });
    }

    // Delete series
    if (action === 'delete') {
      if (!body.series_id) return sb.respond(400, { error: 'Missing series_id' });
      // Unlink events first
      await sb.sbPatch('events?series_id=eq.' + body.series_id, { series_id: null });
      await sb.sbDelete('series?id=eq.' + body.series_id);
      return sb.respond(200, { ok: true });
    }

    return sb.respond(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('org-series error:', err);
    return sb.respond(500, { error: err.message });
  }
};
