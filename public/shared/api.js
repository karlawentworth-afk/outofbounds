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

  /**
   * Show the demo switcher bar for superadmins.
   * Four tabs: Organiser, Scoreboard, Player, Results.
   */
  function showDemoSwitcher() {
    if (document.getElementById('demo-switcher')) return;
    var bar = document.createElement('div');
    bar.id = 'demo-switcher';
    bar.style.cssText = 'background:#10344E;display:flex;align-items:center;justify-content:center;gap:0;position:fixed;top:0;left:0;right:0;z-index:10000;font-size:12px;font-weight:600;';

    var tabs = [
      { label: 'Organiser', href: '/o/#view-as-demo' },
      { label: 'Scoreboard', href: '/board/#/demo/autumn-invitational' },
      { label: 'Demo player', href: '/p/demo/autumn-invitational/demo-scorer-group-001-token' },
      { label: 'Results', href: '/r/demo/spring-charity-classic' },
      { label: 'My account', href: '/o/#my-account' }
    ];

    var currentPath = location.pathname;
    tabs.forEach(function (t) {
      var a = document.createElement('a');
      a.href = t.href;
      a.textContent = t.label;
      var isActive = currentPath.indexOf(t.href.split('#')[0].split('?')[0]) === 0 && t.href.split('#')[0].split('?')[0].length > 1;
      a.style.cssText = 'flex:1;text-align:center;padding:8px 4px;color:' + (isActive ? '#fff' : 'rgba(255,255,255,.5)') + ';text-decoration:none;border-bottom:2px solid ' + (isActive ? '#2F7A45' : 'transparent') + ';';
      bar.appendChild(a);
    });

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.style.paddingTop = '36px';

    // On board page: fade out after 5s, show on tap
    if (currentPath.indexOf('/board') === 0) {
      var fadeTimer = setTimeout(function () { bar.style.opacity = '0'; bar.style.transition = 'opacity 0.5s'; }, 5000);
      document.addEventListener('click', function () {
        bar.style.opacity = '1';
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () { bar.style.opacity = '0'; }, 5000);
      });
    }
  }

  exports.api = api;
  exports.showTestBanner = showTestBanner;
  exports.showDemoSwitcher = showDemoSwitcher;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOB = window.OOB || {}));
