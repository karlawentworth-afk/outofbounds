// theme.js — applies organiser branding from config-get endpoint
// Loads organiser colours and logo, sets CSS custom properties.

(function (exports) {
  'use strict';

  function applyTheme(config) {
    if (!config) return;
    var root = document.documentElement;
    if (config.primary_colour) root.style.setProperty('--primary', config.primary_colour);
    if (config.accent_colour) root.style.setProperty('--accent', config.accent_colour);
    if (config.text_on_primary) root.style.setProperty('--text-on-primary', config.text_on_primary);

    // Set logo if element exists
    var logoEl = document.getElementById('org-logo');
    if (logoEl && config.logo_url) {
      logoEl.src = config.logo_url;
      logoEl.style.display = '';
    }

    // Set event name if element exists
    var nameEl = document.getElementById('event-name');
    if (nameEl && config.event_name) {
      nameEl.textContent = config.event_name;
    }

    // Set sponsor logo if element exists
    var sponsorEl = document.getElementById('sponsor-logo');
    if (sponsorEl && config.sponsor_logo_url) {
      sponsorEl.src = config.sponsor_logo_url;
      sponsorEl.style.display = '';
    }
  }

  // Load config from the function and apply
  function loadTheme(orgSlug, eventSlug) {
    var query = { org: orgSlug };
    if (eventSlug) query.event = eventSlug;
    return exports.api('config-get', { query: query }).then(applyTheme);
  }

  exports.applyTheme = applyTheme;
  exports.loadTheme = loadTheme;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOB = window.OOB || {}));
