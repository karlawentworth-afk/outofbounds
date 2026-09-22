'use strict';

var sb = require('./shared/supabase');
var engine = require('../../public/shared/engine');
var fs = require('fs');
var path = require('path');

var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T12:00:00');
  return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function toSurnames(names) {
  return (names || '').split(' & ').map(function (n) {
    var p = n.trim().split(' ');
    return p.length > 1 ? p[p.length - 1] : p[0];
  }).join(' / ');
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Read the template HTML once (co-located with the function)
var templatePath = path.join(__dirname, 'results-template.html');
var templateHtml = null;

exports.handler = async function (event) {
  // Parse path: /r/<org>/<event>
  var pathParts = (event.path || '').replace(/^\/r\/?/, '').split('/').filter(Boolean);
  var orgSlug = pathParts[0] || '';
  var eventSlug = pathParts[1] || '';

  if (!orgSlug || !eventSlug) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: '<p>Missing event.</p>' };
  }

  try {
    // Fetch organiser
    var orgs = await sb.sbGet(
      'organisers?slug=eq.' + encodeURIComponent(orgSlug) +
      '&select=id,name&limit=1'
    );
    if (!orgs || !orgs.length) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: '<p>Not found.</p>' };
    }
    var org = orgs[0];

    // Fetch event
    var events = await sb.sbGet(
      'events?organiser_id=eq.' + org.id +
      '&slug=eq.' + encodeURIComponent(eventSlug) +
      '&select=id,name,event_date,format,handicap_allowance,status,course_id&limit=1'
    );
    if (!events || !events.length) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: '<p>Event not found.</p>' };
    }
    var ev = events[0];

    // Fetch scores for OG tags
    var players = await sb.sbGet('players?event_id=eq.' + ev.id + '&select=id,display_name,playing_handicap,group_id,pair_key');
    var groups = await sb.sbGet('groups?event_id=eq.' + ev.id + '&select=id,group_number,tee_time,starting_hole');
    var scores = await sb.sbGet('hole_scores?event_id=eq.' + ev.id + '&select=player_id,hole_number,gross_score,picked_up');
    var holes = [];
    if (ev.course_id) {
      holes = await sb.sbGet('course_holes?course_id=eq.' + ev.course_id + '&select=hole_number,par,stroke_index&order=hole_number.asc');
    }

    // Build score maps
    var scoreMap = {};
    var pickedUpMap = {};
    (scores || []).forEach(function (s) {
      if (!scoreMap[s.player_id]) scoreMap[s.player_id] = {};
      if (!pickedUpMap[s.player_id]) pickedUpMap[s.player_id] = {};
      if (s.picked_up) { pickedUpMap[s.player_id][s.hole_number] = true; }
      else if (s.gross_score != null) { scoreMap[s.player_id][s.hole_number] = s.gross_score; }
    });

    var entries = engine.buildStandings({
      scores: scoreMap, pickedUp: pickedUpMap,
      holes: holes || [], players: players || [], groups: groups || [],
      format: ev.format, maxHole: 18
    });
    var played = entries.filter(function (e) { return e.hasPlayed; });

    // Build OG data
    var ogTitle = ev.name + ' Results';
    var winnerSurnames = played.length > 0 ? toSurnames(played[0].names) : '';
    var winnerPts = played.length > 0 ? played[0].points : 0;
    var winVerb = played.length > 0 && played[0].names.indexOf(' & ') !== -1 ? 'win' : 'wins';
    var ogDesc = played.length > 0
      ? winnerSurnames + ' ' + winVerb + ' with ' + winnerPts + ' points at ' + ev.name
      : ev.name + ' — scored with Out of Bounds';
    var dateFormatted = formatDate(ev.event_date);
    var ogUrl = (process.env.APP_BASE_URL || 'https://score.outofboundsevents.com') + '/r/' + orgSlug + '/' + eventSlug;
    var ogImage = ogUrl + '/og.png';

    // Top 3 for description
    var top3 = played.slice(0, 3).map(function (e, i) {
      return (i + 1) + '. ' + toSurnames(e.names) + ' (' + e.points + ' pts)';
    }).join(' | ');
    if (top3) ogDesc += '. ' + top3;

    // Read template
    if (!templateHtml) {
      templateHtml = fs.readFileSync(templatePath, 'utf8');
    }

    // Inject OG tags into the template
    var html = templateHtml
      .replace('{{OG_TITLE}}', esc(ogTitle))
      .replace('{{OG_DESC}}', esc(ogDesc))
      .replace('{{OG_URL}}', esc(ogUrl))
      .replace('{{OG_IMAGE}}', esc(ogImage))
      .replace('{{PAGE_TITLE}}', esc(ogTitle + ' — Out of Bounds'))
      .replace('{{EVENT_DATE}}', esc(dateFormatted))
      .replace('{{ORG_SLUG}}', esc(orgSlug))
      .replace('{{EVENT_SLUG}}', esc(eventSlug));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': ev.status === 'finished' ? 'public, max-age=3600' : 'no-cache'
      },
      body: html
    };
  } catch (err) {
    console.error('results-page error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: '<p>Error loading results.</p>' };
  }
};
