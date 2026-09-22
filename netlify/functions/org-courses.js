'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return sb.respond(204, '');
  }

  var qs = event.queryStringParameters || {};

  // GET: search courses or get course details
  if (event.httpMethod === 'GET') {
    try {
      if (qs.id) {
        // Get specific course with tees and holes
        var courses = await sb.sbGet(
          'courses?id=eq.' + qs.id + '&select=id,name,club&limit=1'
        );
        if (!courses || !courses.length) {
          return sb.respond(404, { error: 'Course not found' });
        }
        var tees = await sb.sbGet(
          'course_tees?course_id=eq.' + qs.id +
          '&select=id,tee_name,colour,slope,rating,par_total'
        );
        var holes = await sb.sbGet(
          'course_holes?course_id=eq.' + qs.id +
          '&select=id,hole_number,par,stroke_index&order=hole_number.asc'
        );
        return sb.respond(200, {
          course: courses[0],
          tees: tees || [],
          holes: holes || []
        });
      }

      if (qs.search) {
        var search = qs.search.trim();
        // ilike search on name
        var results = await sb.sbGet(
          'courses?name=ilike.*' + encodeURIComponent(search) + '*' +
          '&select=id,name,club' +
          '&limit=20&order=name.asc'
        );
        return sb.respond(200, { courses: results || [] });
      }

      return sb.respond(400, { error: 'Provide search or id parameter' });
    } catch (err) {
      console.error('org-courses GET error:', err);
      return sb.respond(500, { error: err.message });
    }
  }

  // POST: create a new course with tee and holes
  if (event.httpMethod !== 'POST') {
    return sb.respond(405, { error: 'Method not allowed' });
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return sb.respond(400, { error: 'Invalid JSON' });
  }

  if (!body.name || !body.name.trim()) {
    return sb.respond(400, { error: 'Missing course name' });
  }
  if (!body.tee_name) {
    return sb.respond(400, { error: 'Missing tee_name' });
  }
  if (!body.holes || body.holes.length !== 18) {
    return sb.respond(400, { error: 'Must provide exactly 18 holes' });
  }

  try {
    // Create course
    var courseRow = {
      name: body.name.trim(),
      club: body.club || null,
      organiser_id: body.organiser_id || null
    };
    if (body.organiser_id) {
      courseRow.contributed_by = body.organiser_id;
    }

    var created = await sb.sbPost('courses', courseRow);
    var course = Array.isArray(created) ? created[0] : created;

    // Create tee
    var teeRow = {
      course_id: course.id,
      tee_name: body.tee_name,
      colour: body.tee_colour || null,
      slope: body.slope || 113,
      rating: body.rating || 72,
      par_total: body.par_total || 72
    };
    var createdTee = await sb.sbPost('course_tees', teeRow);
    var tee = Array.isArray(createdTee) ? createdTee[0] : createdTee;

    // Create holes
    var holeRows = body.holes.map(function (h) {
      return {
        course_id: course.id,
        hole_number: h.hole_number,
        par: h.par,
        stroke_index: h.stroke_index
      };
    });
    await sb.sbPost('course_holes', holeRows);

    return sb.respond(200, { course: course, tee: tee });
  } catch (err) {
    console.error('org-courses POST error:', err);
    return sb.respond(500, { error: err.message });
  }
};
