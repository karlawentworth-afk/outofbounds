'use strict';

var sb = require('./supabase');

/**
 * Check if an organiser is on the Pro plan.
 * Returns the organiser row if Pro, or null if not.
 * Throws a 403-shaped error string if not Pro.
 */
async function assertPro(organiserId) {
  var orgs = await sb.sbGet(
    'organisers?id=eq.' + organiserId +
    '&select=id,plan' +
    '&limit=1'
  );

  if (!orgs || !orgs.length) {
    throw { status: 404, error: 'Organiser not found' };
  }

  var org = orgs[0];

  // Pro by subscription
  if (org.plan === 'pro') return org;

  // Pro by comp (not expired) — comp_until added in migration 016
  if (org.comp_until) {
    var compEnd = new Date(org.comp_until);
    if (compEnd > new Date()) return org;
  }

  throw { status: 403, error: 'Pro feature. Upgrade at /o/#billing' };
}

/**
 * Check if organiser is Pro. Returns true/false without throwing.
 */
async function isPro(organiserId) {
  try {
    await assertPro(organiserId);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { assertPro: assertPro, isPro: isPro };
