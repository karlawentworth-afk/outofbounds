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

  exports.api = api;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOB = window.OOB || {}));
