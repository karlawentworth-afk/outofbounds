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
  var token = qs.token;

  if (!token) {
    return sb.respond(400, { error: 'Missing required query param: token' });
  }

  // Basic token format check (reject obviously bad input)
  if (token.length < 4 || token.length > 200) {
    return sb.respond(400, { error: 'Invalid token' });
  }

  try {
    // 1. Look up the player by token
    var players = await sb.sbGet(
      'players?player_token=eq.' + encodeURIComponent(token) +
      '&select=id,event_id,first_name,last_name,display_name,handicap_index,playing_handicap,group_id,pair_key' +
      '&limit=1'
    );

    if (!players || players.length === 0) {
      return sb.respond(404, { error: 'Player not found' });
    }

    var player = players[0];
    var eventId = player.event_id;
    var groupId = player.group_id;

    // 2. Fetch event, organiser, group, group members, course data, and scores in parallel
    var promises = [
      // Event with organiser branding
      sb.sbGet(
        'events?id=eq.' + eventId +
        '&select=id,name,event_date,format,handicap_allowance,max_handicap,starting_mode,' +
        'leaderboard_freeze_hole,board_show_full,sponsor_name,sponsor_logo_url,headline_text,' +
        'status,locked_at,course_id,tee_id,organiser_id,' +
        'secondary_format,secondary_title,secondary_allowance' +
        '&limit=1'
      ),
      // The group
      groupId
        ? sb.sbGet(
            'groups?id=eq.' + groupId +
            '&select=id,group_number,tee_time,starting_hole,scorer_player_id' +
            '&limit=1'
          )
        : Promise.resolve([]),
      // All players in same group
      groupId
        ? sb.sbGet(
            'players?group_id=eq.' + groupId +
            '&select=id,display_name,playing_handicap,pair_key,handicap_index'
          )
        : Promise.resolve([player])
    ];

    var results = await Promise.all(promises);

    var eventRow = results[0] && results[0][0];
    if (!eventRow) {
      return sb.respond(404, { error: 'Event not found for player' });
    }

    var groupRow = results[1] && results[1][0];
    var groupMembers = results[2] || [];

    // 3. Fetch organiser, course holes, tee info, and scores in parallel
    var promises2 = [
      sb.sbGet(
        'organisers?id=eq.' + eventRow.organiser_id +
        '&select=id,name,slug,logo_url,primary_colour,accent_colour,text_on_primary' +
        '&limit=1'
      ),
      eventRow.course_id
        ? sb.sbGet(
            'course_holes?course_id=eq.' + eventRow.course_id +
            '&select=hole_number,par,stroke_index' +
            '&order=hole_number.asc'
          )
        : Promise.resolve([]),
      eventRow.tee_id
        ? sb.sbGet(
            'course_tees?id=eq.' + eventRow.tee_id +
            '&select=id,tee_name,colour,slope,rating,par_total' +
            '&limit=1'
          )
        : Promise.resolve([]),
      // Scores for the group (all members)
      groupMembers.length > 0
        ? sb.sbGet(
            'hole_scores?event_id=eq.' + eventId +
            '&player_id=in.(' + groupMembers.map(function (m) { return m.id; }).join(',') + ')' +
            '&select=player_id,hole_number,gross_score,picked_up'
          )
        : Promise.resolve([])
    ];

    var results2 = await Promise.all(promises2);

    var organiser = results2[0] && results2[0][0];
    var holes = results2[1] || [];
    var teeRow = results2[2] && results2[2][0];
    var groupScores = results2[3] || [];

    // Build response
    var response = {
      player: {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        display_name: player.display_name,
        handicap_index: player.handicap_index,
        playing_handicap: player.playing_handicap,
        pair_key: player.pair_key
      },
      group: groupRow
        ? {
            id: groupRow.id,
            group_number: groupRow.group_number,
            tee_time: groupRow.tee_time,
            starting_hole: groupRow.starting_hole,
            scorer_player_id: groupRow.scorer_player_id,
            members: groupMembers.map(function (m) {
              return {
                id: m.id,
                display_name: m.display_name,
                playing_handicap: m.playing_handicap,
                pair_key: m.pair_key
              };
            })
          }
        : null,
      event: {
        id: eventRow.id,
        name: eventRow.name,
        event_date: eventRow.event_date,
        format: eventRow.format,
        handicap_allowance: eventRow.handicap_allowance,
        max_handicap: eventRow.max_handicap,
        starting_mode: eventRow.starting_mode,
        leaderboard_freeze_hole: eventRow.leaderboard_freeze_hole,
        board_show_full: eventRow.board_show_full,
        sponsor_name: eventRow.sponsor_name,
        sponsor_logo_url: eventRow.sponsor_logo_url,
        headline_text: eventRow.headline_text,
        status: eventRow.status,
        locked_at: eventRow.locked_at,
        secondary_format: eventRow.secondary_format,
        secondary_title: eventRow.secondary_title,
        secondary_allowance: eventRow.secondary_allowance
      },
      organiser: organiser
        ? {
            id: organiser.id,
            name: organiser.name,
            slug: organiser.slug,
            logo_url: organiser.logo_url,
            primary_colour: organiser.primary_colour,
            accent_colour: organiser.accent_colour,
            text_on_primary: organiser.text_on_primary
          }
        : null,
      course: {
        holes: holes
      },
      tee: teeRow
        ? {
            id: teeRow.id,
            tee_name: teeRow.tee_name,
            colour: teeRow.colour,
            slope: teeRow.slope,
            rating: teeRow.rating,
            par_total: teeRow.par_total
          }
        : null,
      scores: groupScores,
      freezeRule: {
        board_show_full: eventRow.board_show_full,
        leaderboard_freeze_hole: eventRow.leaderboard_freeze_hole,
        note: eventRow.board_show_full
          ? 'All scores visible on leaderboard'
          : 'Leaderboard frozen at hole ' + eventRow.leaderboard_freeze_hole +
            '. Own group scores always visible in full.'
      }
    };

    return sb.respond(200, response);
  } catch (err) {
    console.error('player-context error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
