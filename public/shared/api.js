// api.js — fetch helper with 9-second abort
// Used by all browser views to call Netlify functions.

(function (exports) {
  'use strict';

  var BASE = '/.netlify/functions/';

  function api(fnName, opts) {
    opts = opts || {};
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 9000);

    var url = BASE + fnName;
    if (opts.query) {
      var qs = Object.keys(opts.query).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]);
      }).join('&');
      url += '?' + qs;
    }

    var fetchOpts = {
      method: opts.method || 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }
    };

    if (opts.body) {
      fetchOpts.body = JSON.stringify(opts.body);
    }

    if (opts.token) {
      fetchOpts.headers['Authorization'] = 'Bearer ' + opts.token;
    }

    return fetch(url, fetchOpts)
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) {
          return res.json().catch(function () { return { error: res.statusText }; }).then(function (body) {
            var err = new Error(body.error || 'Request failed');
            err.status = res.status;
            throw err;
          });
        }
        return res.json();
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out');
        }
        throw err;
      });
  }

  /**
   * Show a thin amber banner at the top of the page if test_mode is true.
   * Call after config-get returns.
   */
  function showTestBanner(testMode) {
    if (!testMode) return;
    if (document.getElementById('test-mode-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'test-mode-banner';
    banner.style.cssText = 'background:#E0A800;color:#fff;text-align:center;padding:4px 8px;font-size:12px;font-weight:600;position:fixed;top:0;left:0;right:0;z-index:9999;';
    banner.textContent = 'Test mode. Cards aren\u2019t charged.';
    document.body.insertBefore(banner, document.body.firstChild);
    // Push content down
    document.body.style.paddingTop = (banner.offsetHeight) + 'px';
  }

  exports.api = api;
  exports.showTestBanner = showTestBanner;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOB = window.OOB || {}));
