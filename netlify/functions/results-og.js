'use strict';

var sb = require('./shared/supabase');
var engine = require('../../public/shared/engine');

var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function toSurnames(names) {
  return (names || '').split(' & ').map(function (n) {
    var p = n.trim().split(' ');
    return p.length > 1 ? p[p.length - 1] : p[0];
  }).join(' / ');
}

// Generate a 1200x630 SVG and return as an image
function buildOgSvg(eventName, dateStr, entries) {
  var top3 = entries.slice(0, 3);
  var winner = top3[0] || {};

  // Position labels
  var medals = ['🥇', '🥈', '🥉'];

  var rowsHtml = '';
  top3.forEach(function (e, i) {
    var y = 340 + i * 72;
    var surnames = toSurnames(e.names);
    var posColour = i === 0 ? '#2F7A45' : '#5B6672';
    var nameSize = i === 0 ? '36' : '28';
    var nameWeight = i === 0 ? '700' : '600';

    rowsHtml += '<text x="80" y="' + y + '" font-size="' + nameSize + '" font-weight="' + nameWeight + '" fill="' + posColour + '">' +
      (i + 1) + '.  ' + escXml(surnames) + '</text>';
    rowsHtml += '<text x="1120" y="' + y + '" font-size="' + nameSize + '" font-weight="800" fill="' + posColour + '" text-anchor="end">' +
      e.points + ' pts</text>';
  });

  var svg = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +

    // Background
    '<rect width="1200" height="630" fill="#10344E"/>' +

    // Subtle accent bar
    '<rect x="0" y="0" width="1200" height="6" fill="#2F7A45"/>' +

    // OB mark (text fallback)
    '<text x="80" y="80" font-family="sans-serif" font-size="20" font-weight="800" fill="rgba(255,255,255,0.4)" letter-spacing="0.1em">OUT OF BOUNDS</text>' +

    // Event name
    '<text x="80" y="160" font-family="sans-serif" font-size="48" font-weight="800" fill="#FFFFFF" letter-spacing="-0.02em">' + escXml(eventName) + '</text>' +

    // Date
    '<text x="80" y="205" font-family="sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">' + escXml(dateStr) + '</text>' +

    // Divider
    '<rect x="80" y="240" width="200" height="3" fill="#2F7A45" rx="2"/>' +

    // "Results" label
    '<text x="80" y="290" font-family="sans-serif" font-size="16" font-weight="700" fill="#2F7A45" letter-spacing="0.12em">FINAL RESULTS</text>' +

    // Top 3
    rowsHtml +

    // Footer
    '<text x="80" y="590" font-family="sans-serif" font-size="16" fill="rgba(255,255,255,0.3)">score.outofboundsevents.com</text>' +

    '</svg>';

  return svg;
}

function escXml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

exports.handler = async function (event) {
  // Parse path: /r/<org>/<event>/og.png
  var pathParts = (event.path || '').replace(/^\/r\/?/, '').replace(/\/og\.png$/, '').split('/').filter(Boolean);
  var orgSlug = pathParts[0] || '';
  var eventSlug = pathParts[1] || '';

  if (!orgSlug || !eventSlug) {
    return { statusCode: 400, body: 'Missing event' };
  }

  try {
    var orgs = await sb.sbGet('organisers?slug=eq.' + encodeURIComponent(orgSlug) + '&select=id&limit=1');
    if (!orgs || !orgs.length) return { statusCode: 404, body: 'Not found' };

    var events = await sb.sbGet(
      'events?organiser_id=eq.' + orgs[0].id +
      '&slug=eq.' + encodeURIComponent(eventSlug) +
      '&select=id,name,event_date,format,course_id,status&limit=1'
    );
    if (!events || !events.length) return { statusCode: 404, body: 'Event not found' };
    var ev = events[0];

    // Fetch data for standings
    var [players, groups, scores, holes] = await Promise.all([
      sb.sbGet('players?event_id=eq.' + ev.id + '&select=id,display_name,playing_handicap,group_id,pair_key'),
      sb.sbGet('groups?event_id=eq.' + ev.id + '&select=id,group_number,tee_time,starting_hole'),
      sb.sbGet('hole_scores?event_id=eq.' + ev.id + '&select=player_id,hole_number,gross_score,picked_up'),
      ev.course_id ? sb.sbGet('course_holes?course_id=eq.' + ev.course_id + '&select=hole_number,par,stroke_index&order=hole_number.asc') : Promise.resolve([])
    ]);

    var scoreMap = {};
    var pickedUpMap = {};
    (scores || []).forEach(function (s) {
      if (!scoreMap[s.player_id]) scoreMap[s.player_id] = {};
      if (!pickedUpMap[s.player_id]) pickedUpMap[s.player_id] = {};
      if (s.picked_up) pickedUpMap[s.player_id][s.hole_number] = true;
      else if (s.gross_score != null) scoreMap[s.player_id][s.hole_number] = s.gross_score;
    });

    var entries = engine.buildStandings({
      scores: scoreMap, pickedUp: pickedUpMap,
      holes: holes || [], players: players || [], groups: groups || [],
      format: ev.format, maxHole: 18
    });
    var played = entries.filter(function (e) { return e.hasPlayed; });

    var svg = buildOgSvg(ev.name, formatDate(ev.event_date), played);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': ev.status === 'finished' ? 'public, max-age=86400' : 'no-cache, max-age=60'
      },
      body: svg
    };
  } catch (err) {
    console.error('results-og error:', err);
    return { statusCode: 500, body: 'Error generating image' };
  }
};
