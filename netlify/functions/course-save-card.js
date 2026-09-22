'use strict';

var sb = require('./shared/supabase');

/**
 * Saves a confirmed scorecard (from photo or manual entry).
 * Creates or updates a course with tees and holes.
 *
 * Body: {
 *   club_name, course_name, city, country,
 *   source: 'scorecard_photo' | 'manual',
 *   photo_base64: optional (stored to Supabase Storage),
 *   existing_course_id: optional (update existing card),
 *   verified_by: organiser id,
 *   tee_sets: [{
 *     tee_name, colour, gender, slope_rating, course_rating,
 *     par_total, total_yards, number_of_holes,
 *     holes: [{ hole: 1, par, stroke_index, yards }]
 *   }]
 * }
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');
  if (event.httpMethod !== 'POST') return sb.respond(405, { error: 'Method not allowed' });

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }

  if (!body.club_name) return sb.respond(400, { error: 'Missing club_name' });
  if (!body.tee_sets || !body.tee_sets.length) return sb.respond(400, { error: 'No tee sets provided' });

  try {
    var courseId = body.existing_course_id || null;
    var now = new Date().toISOString();

    // If updating existing, snapshot the old data first
    if (courseId) {
      var oldTees = await sb.sbGet('course_tees?course_id=eq.' + courseId + '&select=*');
      var oldHoles = await sb.sbGet('course_holes?course_id=eq.' + courseId + '&select=*');
      await sb.sbPost('course_versions', {
        course_id: courseId,
        snapshot: JSON.stringify({ tees: oldTees, holes: oldHoles }),
        reason: body.source === 'scorecard_photo' ? 'photo_update' : 'manual_edit',
        changed_by: body.verified_by || null
      });

      // Delete old tees and holes
      await sb.sbRequest('DELETE', 'course_holes?course_id=eq.' + courseId, null);
      await sb.sbRequest('DELETE', 'course_tees?course_id=eq.' + courseId, null);

      // Update course metadata
      await sb.sbPatch('courses?id=eq.' + courseId, {
        club: body.club_name,
        name: body.course_name || body.club_name,
        city: body.city || null,
        country: body.country || null,
        source: body.source || 'manual',
        verified: true,
        verified_by: body.verified_by || null,
        verified_at: now
      });
    } else {
      // Create new course
      var courseRow = {
        club: body.club_name,
        name: body.course_name || body.club_name,
        city: body.city || null,
        country: body.country || null,
        source: body.source || 'manual',
        verified: true,
        verified_by: body.verified_by || null,
        verified_at: now,
        imported_at: now
      };
      var created = await sb.sbPost('courses', courseRow);
      courseId = (Array.isArray(created) ? created[0] : created).id;
    }

    // Create tee rows: one per (colour, rating_gender)
    // Claude returns rating_men/slope_men and rating_women/slope_women per tee colour.
    // Each non-null pair becomes a separate course_tees row.
    var teeSummary = [];
    for (var t = 0; t < body.tee_sets.length; t++) {
      var ts = body.tee_sets[t];
      var colour = (ts.colour || ts.tee_name || '').toLowerCase();
      var teeName = ts.tee_name || 'Tee ' + (t + 1);
      var numHoles = ts.number_of_holes || (ts.holes ? ts.holes.length : 18);

      // Build rating pairs to create rows for
      var ratingPairs = [];
      if (ts.rating_men != null || ts.slope_men != null) {
        ratingPairs.push({ gender: 'men', rating: ts.rating_men, slope: ts.slope_men });
      }
      if (ts.rating_women != null || ts.slope_women != null) {
        ratingPairs.push({ gender: 'women', rating: ts.rating_women, slope: ts.slope_women });
      }
      // Fallback: old format with single rating/slope
      if (ratingPairs.length === 0) {
        if (ts.slope_rating != null || ts.course_rating != null) {
          ratingPairs.push({ gender: ts.rating_gender || 'men', rating: ts.course_rating, slope: ts.slope_rating });
        }
        if (ts.rating_unlabelled != null || ts.slope_unlabelled != null) {
          ratingPairs.push({ gender: 'men', rating: ts.rating_unlabelled, slope: ts.slope_unlabelled });
        }
      }
      // If still nothing, create one row with nulls
      if (ratingPairs.length === 0) {
        ratingPairs.push({ gender: 'men', rating: null, slope: null });
      }

      for (var r = 0; r < ratingPairs.length; r++) {
        var rp = ratingPairs[r];
        var teeRow = {
          course_id: courseId,
          tee_name: teeName,
          colour: colour,
          slope: rp.slope,
          rating: rp.rating,
          par_total: ts.par_total || null,
          rating_gender: rp.gender,
          total_yards: ts.total_yards || null,
          number_of_holes: numHoles
        };

        var createdTee = await sb.sbPost('course_tees', teeRow);
        var teeId = (Array.isArray(createdTee) ? createdTee[0] : createdTee).id;

        teeSummary.push({
          id: teeId,
          tee_name: teeName,
          colour: colour,
          rating_gender: rp.gender,
          rating: rp.rating,
          slope: rp.slope,
          par_total: ts.par_total
        });
      }
    }

    // Create holes from the first tee set (holes are per-course)
    var holesSource = body.tee_sets[0].holes || [];
    for (var h = 0; h < holesSource.length; h++) {
      var hole = holesSource[h];
      await sb.sbPost('course_holes', {
        course_id: courseId,
        hole_number: hole.hole || (h + 1),
        par: hole.par || 4,
        stroke_index: hole.stroke_index || (h + 1)
      });
    }

    return sb.respond(200, {
      course_id: courseId,
      tees: teeSummary,
      holes_created: holesSource.length,
      verified: true
    });

  } catch (err) {
    console.error('course-save-card error:', err);
    return sb.respond(500, { error: err.message || 'Internal error' });
  }
};
