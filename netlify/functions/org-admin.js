'use strict';

var sb = require('./shared/supabase');

/**
 * Verify the caller is a superadmin. Returns organiser row or null.
 */
async function verifySuperadmin(organiserId) {
  var orgs = await sb.sbGet(
    'organisers?id=eq.' + organiserId +
    '&select=id,is_superadmin' +
    '&limit=1'
  );
  if (!orgs || !orgs.length || !orgs[0].is_superadmin) return null;
  return orgs[0];
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};

  // All requests need organiser_id for superadmin check
  var body = {};
  if (event.httpMethod === 'POST' || event.httpMethod === 'PATCH') {
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return sb.respond(400, { error: 'Invalid JSON' }); }
  }

  var adminId = body.organiser_id || qs.organiser_id;
  if (!adminId) return sb.respond(400, { error: 'Missing organiser_id' });

  var admin = await verifySuperadmin(adminId);
  if (!admin) return sb.respond(403, { error: 'Not authorised' });

  try {
    // GET: list all organisers
    if (event.httpMethod === 'GET') {
      var orgs = await sb.sbGet(
        'organisers?select=id,name,slug,plan,plan_source,comp_until,contact_email,is_superadmin,created_at,logo_url,primary_colour,display_name&order=created_at.desc'
      );

      // Count events per organiser
      var events = await sb.sbGet('events?select=organiser_id,status');
      var counts = {};
      (events || []).forEach(function (e) {
        if (!counts[e.organiser_id]) counts[e.organiser_id] = { total: 0, live: 0, finished: 0 };
        counts[e.organiser_id].total++;
        if (e.status === 'live') counts[e.organiser_id].live++;
        if (e.status === 'finished') counts[e.organiser_id].finished++;
      });

      var result = (orgs || []).map(function (o) {
        var c = counts[o.id] || { total: 0, live: 0, finished: 0 };
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          plan_source: o.plan_source,
          comp_until: o.comp_until,
          contact_email: o.contact_email,
          is_superadmin: o.is_superadmin,
          created_at: o.created_at,
          logo_url: o.logo_url,
          primary_colour: o.primary_colour,
          display_name: o.display_name,
          events_total: c.total,
          events_live: c.live,
          events_finished: c.finished
        };
      });

      return sb.respond(200, { organisers: result });
    }

    // POST: actions
    if (event.httpMethod === 'POST') {
      var action = body.action;

      // Set comp plan
      if (action === 'set_comp') {
        if (!body.target_id) return sb.respond(400, { error: 'Missing target_id' });

        var update = {
          plan: 'pro',
          plan_source: 'comp'
        };

        if (body.comp_until) {
          update.comp_until = body.comp_until;
        } else {
          // Default: far future
          update.comp_until = '2099-12-31T23:59:59Z';
        }

        await sb.sbPatch('organisers?id=eq.' + body.target_id, update);
        return sb.respond(200, { ok: true });
      }

      // Remove comp (back to Play)
      if (action === 'remove_comp') {
        if (!body.target_id) return sb.respond(400, { error: 'Missing target_id' });

        await sb.sbPatch('organisers?id=eq.' + body.target_id, {
          plan: 'per_event',
          plan_source: 'stripe',
          comp_until: null
        });

        return sb.respond(200, { ok: true });
      }

      // Rebrand demo organiser
      if (action === 'rebrand_demo') {
        var demoOrgs = await sb.sbGet(
          "organisers?slug=eq.demo&select=id&limit=1"
        );
        if (!demoOrgs || !demoOrgs.length) {
          // Try the seed demo slug
          demoOrgs = await sb.sbGet(
            "organisers?slug=eq.demo-events&select=id&limit=1"
          );
        }
        if (!demoOrgs || !demoOrgs.length) return sb.respond(404, { error: 'Demo organiser not found' });

        var rebrand = {};
        if (body.display_name !== undefined) rebrand.display_name = body.display_name;
        if (body.name !== undefined) rebrand.name = body.name;
        if (body.logo_url !== undefined) rebrand.logo_url = body.logo_url;
        if (body.primary_colour !== undefined) rebrand.primary_colour = body.primary_colour;
        if (body.accent_colour !== undefined) rebrand.accent_colour = body.accent_colour;
        if (body.text_on_primary !== undefined) rebrand.text_on_primary = body.text_on_primary;

        if (Object.keys(rebrand).length === 0) return sb.respond(400, { error: 'No fields to update' });

        await sb.sbPatch('organisers?id=eq.' + demoOrgs[0].id, rebrand);
        return sb.respond(200, { ok: true });
      }

      return sb.respond(400, { error: 'Unknown action: ' + action });
    }

    return sb.respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('org-admin error:', err);
    return sb.respond(500, { error: err.message });
  }
};
