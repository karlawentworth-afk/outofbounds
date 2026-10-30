// engine.js — Out of Bounds scoring engine
// Shared between browser (board, player view) and Netlify functions.
// No dependencies. No framework. Pure maths.
//
// This is the SINGLE source of truth for scoring calculations.
// Every view and every function imports this. No duplicate engines.

(function (exports) {
  'use strict';

  // ── Playing handicap ──────────────────────────────────────────
  // Round ONCE at the end. Never round the course handicap first.
  //
  // Verification (from brief):
  //   24 index, slope 128, rating 71.2, par 72, 85% allowance
  //   raw = 24 * (128/113) + (71.2 - 72) = 24 * 1.13274... + (-0.8)
  //       = 27.186... - 0.8 = 26.386...
  //   × 0.85 = 22.428...
  //   round(22.428) = 22
  //   cap at 54 → 22
  //
  function playingHandicap(index, slope, rating, par, allowance, cap) {
    if (index == null || index === 0) return 0;
    slope     = slope     || 113;
    rating    = rating    || par || 72;
    par       = par       || 72;
    allowance = allowance != null ? allowance : 0.95;
    cap       = cap       != null ? cap : 54;
    var raw = index * (slope / 113) + (rating - par);
    return Math.min(Math.round(raw * allowance), cap);
  }

  // ── Shots received on a hole ──────────────────────────────────
  // Standard distribution: base shots plus one extra if stroke
  // index falls within the remainder.
  //
  // Verification (PH 22):
  //   base = floor(22/18) = 1, remainder = 22 % 18 = 4
  //   SI 1: 1 <= 4 → +1 → 2 shots
  //   SI 4: 4 <= 4 → +1 → 2 shots
  //   SI 5: 5 <= 4 → no  → 1 shot
  //   SI 18: 18 <= 4 → no → 1 shot
  //
  function shotsOnHole(ph, si) {
    if (ph <= 0) return 0;
    var base = Math.floor(ph / 18);
    var remainder = ph % 18;
    return base + (si <= remainder ? 1 : 0);
  }

  // ── Stableford points for a single hole ───────────────────────
  // par + 2 − (gross − shots) = max(0, result)
  // picked_up → 0 points, counts as recorded.
  //
  function stablefordPoints(par, gross, shots) {
    if (gross == null || gross <= 0) return 0;
    var nett = gross - shots;
    return Math.max(0, par - nett + 2);
  }

  // ── Convenience: full single-hole calculation ─────────────────
  function holePoints(gross, pickedUp, par, si, ph) {
    if (pickedUp || gross == null) return 0;
    var shots = shotsOnHole(ph, si);
    return stablefordPoints(par, gross, shots);
  }

  // ── Build standings ───────────────────────────────────────────
  // Computes leaderboard from raw data. Works for all three formats.
  //
  // params:
  //   scores:       { playerId: { holeNumber: grossScore } }
  //   pickedUp:     { playerId: { holeNumber: true } }
  //   holes:        [{ hole_number, par, stroke_index }]  sorted
  //   players:      [{ id, display_name, playing_handicap, group_id, pair_key }]
  //   groups:       [{ id, group_number, tee_time, starting_hole }]
  //   format:       'individual_stableford' | 'better_ball_pairs' | 'better_ball_2from4'
  //   maxHole:      18 or freeze hole
  //   tee:          { slope, rating, par_total } (for display only; PH pre-computed)
  //   allowancePct: e.g. 85 (for display only)
  //
  function buildStandings(params) {
    var scores    = params.scores || {};
    var pickedUp  = params.pickedUp || {};
    var holes     = (params.holes || []).filter(function (h) { return h.hole_number <= (params.maxHole || 18); });
    var players   = params.players || [];
    var groups    = params.groups || [];
    var format    = params.format || 'individual_stableford';
    var maxHole   = params.maxHole || 18;

    var playerById = {};
    players.forEach(function (p) { playerById[p.id] = p; });

    var groupById = {};
    groups.forEach(function (g) { groupById[g.id] = g; });

    // Group players by unit (individual, pair, or group of 4)
    var units = buildUnits(players, groups, format);

    var entries = [];

    units.forEach(function (unit) {
      var totalPts = 0;
      var thru = 0;
      var hasPlayed = false;
      var holeDetail = {};

      holes.forEach(function (h) {
        var hn = h.hole_number;
        var holePts;

        if (format === 'individual_stableford') {
          // Single player
          var p = unit.members[0];
          if (!p) return;
          var g = scores[p.id] ? scores[p.id][hn] : null;
          var pu = pickedUp[p.id] ? pickedUp[p.id][hn] : false;
          if (g != null || pu) {
            hasPlayed = true;
            thru = Math.max(thru, hn);
          }
          holePts = holePoints(g, pu, h.par, h.stroke_index, p.playing_handicap || 0);
          holeDetail[hn] = holePts;
          totalPts += holePts;

        } else if (format === 'better_ball_pairs') {
          // Best 1 of 2
          var best = 0;
          var anyScored = false;
          unit.members.forEach(function (p) {
            var g = scores[p.id] ? scores[p.id][hn] : null;
            var pu = pickedUp[p.id] ? pickedUp[p.id][hn] : false;
            if (g != null || pu) anyScored = true;
            var pts = holePoints(g, pu, h.par, h.stroke_index, p.playing_handicap || 0);
            if (pts > best) best = pts;
          });
          if (anyScored) {
            hasPlayed = true;
            thru = Math.max(thru, hn);
          }
          holeDetail[hn] = best;
          totalPts += best;

        } else if (format === 'better_ball_2from4') {
          // Best 2 of up to 4
          var allPts = [];
          var anyScored = false;
          unit.members.forEach(function (p) {
            var g = scores[p.id] ? scores[p.id][hn] : null;
            var pu = pickedUp[p.id] ? pickedUp[p.id][hn] : false;
            if (g != null || pu) anyScored = true;
            allPts.push(holePoints(g, pu, h.par, h.stroke_index, p.playing_handicap || 0));
          });
          allPts.sort(function (a, b) { return b - a; });
          var best2 = (allPts[0] || 0) + (allPts[1] || 0);
          if (anyScored) {
            hasPlayed = true;
            thru = Math.max(thru, hn);
          }
          holeDetail[hn] = best2;
          totalPts += best2;
        }
      });

      // Countback: last 9, last 6, last 3, last 1
      var cb9 = cbSum(holeDetail, 10, 9, maxHole);
      var cb6 = cbSum(holeDetail, 13, 6, maxHole);
      var cb3 = cbSum(holeDetail, 16, 3, maxHole);
      var cb1 = holeDetail[18] || 0;

      var names = unit.members.map(function (p) { return p.display_name; });
      var group = unit.groupId ? groupById[unit.groupId] : null;

      entries.push({
        names:       names.join(' & '),
        memberIds:   unit.members.map(function (p) { return p.id; }),
        groupId:     unit.groupId,
        groupNumber: group ? group.group_number : null,
        teeTime:     group ? group.tee_time : null,
        points:      totalPts,
        thru:        thru,
        hasPlayed:   hasPlayed,
        holeDetail:  holeDetail,
        cb9: cb9, cb6: cb6, cb3: cb3, cb1: cb1,
        countback:   null  // set after sorting for ties
      });
    });

    // Sort: played first, then points desc, then countback cascade
    entries.sort(function (a, b) {
      if (a.hasPlayed !== b.hasPlayed) return a.hasPlayed ? -1 : 1;
      if (a.points !== b.points) return b.points - a.points;
      if (a.cb9 !== b.cb9) return b.cb9 - a.cb9;
      if (a.cb6 !== b.cb6) return b.cb6 - a.cb6;
      if (a.cb3 !== b.cb3) return b.cb3 - a.cb3;
      return b.cb1 - a.cb1;
    });

    // Mark countback strings where entries are tied on points
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].hasPlayed) continue;
      var j = i + 1;
      while (j < entries.length && entries[j].hasPlayed && entries[j].points === entries[i].points) {
        j++;
      }
      if (j - i > 1) {
        for (var k = i; k < j; k++) {
          entries[k].countback = 'Last 9: ' + entries[k].cb9 +
            ' / Last 6: ' + entries[k].cb6 +
            ' / Last 3: ' + entries[k].cb3 +
            ' / 18th: ' + entries[k].cb1;
        }
      }
    }

    return entries;
  }

  // ── Build scoring units from players ──────────────────────────
  function buildUnits(players, groups, format) {
    if (format === 'individual_stableford') {
      return players.map(function (p) {
        return { members: [p], groupId: p.group_id };
      });
    }

    // Pairs and 2-from-4: group players by group_id
    var byGroup = {};
    players.forEach(function (p) {
      if (!p.group_id) return;
      if (!byGroup[p.group_id]) byGroup[p.group_id] = [];
      byGroup[p.group_id].push(p);
    });

    var units = [];

    if (format === 'better_ball_pairs') {
      // Within each group, split by pair_key
      Object.keys(byGroup).forEach(function (gid) {
        var byPair = {};
        byGroup[gid].forEach(function (p) {
          var key = p.pair_key || 'A';
          if (!byPair[key]) byPair[key] = [];
          byPair[key].push(p);
        });
        Object.keys(byPair).forEach(function (pk) {
          units.push({ members: byPair[pk], groupId: gid });
        });
      });
    } else if (format === 'better_ball_2from4') {
      // Whole group is one unit
      Object.keys(byGroup).forEach(function (gid) {
        units.push({ members: byGroup[gid], groupId: gid });
      });
    }

    return units;
  }

  // ── Countback sum helper ──────────────────────────────────────
  function cbSum(holeDetail, fromHole, count, maxHole) {
    var total = 0;
    var end = Math.min(fromHole + count - 1, maxHole || 18);
    for (var h = fromHole; h <= end; h++) {
      total += holeDetail[h] || 0;
    }
    return total;
  }

  // ── Exports ───────────────────────────────────────────────────
  exports.playingHandicap = playingHandicap;
  exports.shotsOnHole     = shotsOnHole;
  exports.stablefordPoints = stablefordPoints;
  exports.holePoints      = holePoints;
  exports.buildStandings  = buildStandings;
  exports.buildUnits      = buildUnits;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOB = window.OOB || {}));
