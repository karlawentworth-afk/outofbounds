/**
 * app-shell.js — Native app shell. Every native-only element
 * is created here and nowhere else. This file is a no-op on
 * the web. Waits up to 2s for the Capacitor bridge to load
 * (remote-loaded apps inject it after page scripts run).
 *
 * isNativeApp() returns true when Capacitor.isNativePlatform()
 * is true, or when ?native=1 is in the URL (for Playwright testing).
 */
(function () {
  'use strict';

  window.OOB = window.OOB || {};

  var testFlag = /[?&]native=1/.test(window.location.search);

  function checkNative() {
    if (testFlag) return true;
    try { return window.Capacitor && window.Capacitor.isNativePlatform(); } catch (e) { return false; }
  }

  /** Public helper — available everywhere app-shell.js is loaded */
  window.isNativeApp = checkNative;

  // Check immediately
  if (checkNative()) {
    boot();
    return;
  }

  // Bridge not ready yet — poll for up to 2 seconds
  var attempts = 0;
  var poll = setInterval(function () {
    attempts++;
    if (checkNative()) {
      clearInterval(poll);
      boot();
    } else if (attempts >= 20) {
      clearInterval(poll);
      // Not native — do nothing
      window.OOB.native = false;
    }
  }, 100);

  function boot() {
  window.OOB.native = true;

  // ── Mark the document ──
  document.documentElement.classList.add('native-app');

  // ── Inject native-only CSS ──
  var css = document.createElement('style');
  css.textContent = [
    /* Hide web-only chrome */
    '.native-app #install-banner { display: none !important; }',

    /* Safe area on top bar — add inset to existing padding */
    '.native-app .top-bar { padding-top: calc(16px + env(safe-area-inset-top, 0px)); min-height: calc(60px + env(safe-area-inset-top, 0px)); }',
    '.native-app .step-strip { margin-top: 0; }',
    /* Prevent iOS overscroll and horizontal scroll */
    '.native-app html { height: 100%; overflow: hidden; }',
    '.native-app body { height: 100%; overflow: hidden; overflow-x: hidden; }',
    '.native-app .screen.active { overflow-x: hidden; }',
    /* Hide dashboard People/Settings buttons — bottom tab bar handles these */
    '.native-app .dash-header .btn-outline { display: none !important; }',
    '.native-app .screen.active { height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }',
    '.native-app .top-bar { position: fixed; top: 0; left: 0; right: 0; }',
    '.native-app .screen.active { padding-top: calc(60px + env(safe-area-inset-top, 0px)); }',
    /* Player view: pad for safe areas */
    '.native-app .hole-bar { padding-left: max(12px, env(safe-area-inset-left, 12px)); padding-right: max(12px, env(safe-area-inset-right, 12px)); }',
    '.native-app .player-rows { padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }',
    '.native-app .save-bar { padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }',
    '.native-app .keypad { padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }',
    '.native-app .status-line { padding-left: max(16px, env(safe-area-inset-left, 16px)); padding-right: max(16px, env(safe-area-inset-right, 16px)); }',

    /* Pad content for bottom tab bar */
    '.native-app .container { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }',

    /* Sign-in: replace web version with native welcome */
    '.native-app #screen-signin .logo-big,',
    '.native-app #screen-signin h2,',
    '.native-app #screen-signin .sub,',
    '.native-app #screen-signin .auth-btns,',
    '.native-app #screen-signin .magic-link-form,',
    '.native-app #screen-signin > p { display: none !important; }',
    '.native-app #screen-signin { background: var(--navy, #10344E) !important; }',
  ].join('\n');
  document.head.appendChild(css);

  // ── Remove purchase/pricing/billing/marketing elements from the DOM ──
  // Apple guideline 3.1.1: no references to external purchases
  var removeIds = [
    'billing-upgrade', 'btn-upgrade', 'billing-manage',
    'billing-cancelling', 'screen-billing',
    'golive-fee', 'golive-pro-card'
  ];
  removeIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  // Remove any links to outofboundsevents.com (marketing site)
  document.querySelectorAll('a[href*="outofboundsevents.com"]').forEach(function (a) {
    // Keep mailto: links (support), remove web links
    if (a.href && a.href.indexOf('mailto:') === -1) {
      a.removeAttribute('href');
      a.removeAttribute('onclick');
      a.style.pointerEvents = 'none';
    }
  });

  // Remove price text nodes: £ amounts, "99p", "Upgrade", pricing hints
  document.querySelectorAll('#golive-disclaimer, #golive-fee-base, #golive-fee-players, #golive-total, .price-row, #billing-save-hint').forEach(function (el) {
    el.remove();
  });

  // Remove "Scored with Out of Bounds" promo links (keep plain text version)
  document.querySelectorAll('.promo a[href*="outofboundsevents.com"]').forEach(function (a) {
    a.remove();
  });

  // Update the native go-live block message (no URL)
  var nativeBlock = document.getElementById('golive-native-block');
  if (nativeBlock) {
    nativeBlock.textContent = "This event isn\u2019t active yet. Manage your account on the web.";
  }

  // Remove store badges from settings/footer
  document.querySelectorAll('#store-android, #store-apple, .store-badges').forEach(function (el) {
    el.remove();
  });

  // ── Native welcome screen (email only, no Google/Apple) ──
  var signin = document.getElementById('screen-signin');
  if (signin) {
    // Hide the web auth buttons
    var authButtons = document.getElementById('auth-buttons');
    if (authButtons) authButtons.style.display = 'none';
    var magicForm = document.getElementById('magic-link-form');
    if (magicForm) magicForm.style.display = 'none';
    // Hide the "No passwords" footer
    var fineP = signin.querySelector('.fine');
    if (fineP) fineP.style.display = 'none';

    var wel = document.createElement('div');
    wel.id = 'native-welcome';
    wel.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;width:100%;';
    wel.innerHTML =
      '<img src="/img/icon-white.png" alt="" style="height:80px;margin-bottom:24px;">' +
      '<div style="font-family:Poppins,sans-serif;font-size:28px;font-weight:800;color:#fff;margin-bottom:40px;letter-spacing:-0.02em;">Out of Bounds</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;width:min(320px,100%);">' +
        '<button onclick="nativeSignInEmail()" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 24px;border-radius:999px;font-family:Poppins,sans-serif;font-weight:600;font-size:16px;cursor:pointer;background:#fff;color:#000;border:none;">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>' +
          'Continue with email</button>' +
      '</div>';
    signin.insertBefore(wel, signin.firstChild);
  }

  // ── Bottom tab bar (hidden until signed in) ──
  var tabBar = document.createElement('nav');
  tabBar.id = 'native-tab-bar';
  tabBar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:calc(56px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:#fff;border-top:1px solid #E3E7EB;z-index:100;display:none;align-items:center;justify-content:space-around;';
  tabBar.innerHTML =
    '<button class="ntab active" data-tab="events" style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:600;color:#2F7A45;cursor:pointer;border:none;background:none;font-family:inherit;padding:8px 16px;">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Events</button>' +
    '<button class="ntab" data-tab="people" style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:600;color:#5B6672;cursor:pointer;border:none;background:none;font-family:inherit;padding:8px 16px;">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>People</button>' +
    '<button class="ntab" data-tab="settings" style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:600;color:#5B6672;cursor:pointer;border:none;background:none;font-family:inherit;padding:8px 16px;">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Settings</button>';
  document.body.appendChild(tabBar);

  // Show/hide tab bar based on which screen is active
  function updateTabBarVisibility() {
    var signinVisible = document.getElementById('screen-signin');
    var onboardVisible = document.getElementById('screen-onboard');
    var loadingVisible = document.getElementById('screen-loading');
    var isSignedIn = (signinVisible && !signinVisible.classList.contains('active')) &&
                     (onboardVisible && !onboardVisible.classList.contains('active')) &&
                     (loadingVisible && !loadingVisible.classList.contains('active'));
    tabBar.style.display = isSignedIn ? 'flex' : 'none';
  }

  // Watch for screen changes via MutationObserver
  var observer = new MutationObserver(updateTabBarVisibility);
  document.querySelectorAll('.screen').forEach(function (s) {
    observer.observe(s, { attributes: true, attributeFilter: ['class'] });
  });
  // Also check periodically for the first few seconds
  var checkCount = 0;
  var checkInterval = setInterval(function () {
    updateTabBarVisibility();
    if (++checkCount > 20) clearInterval(checkInterval);
  }, 500);

  tabBar.addEventListener('click', function (e) {
    var btn = e.target.closest('.ntab');
    if (!btn) return;
    tabBar.querySelectorAll('.ntab').forEach(function (t) { t.style.color = '#5B6672'; });
    btn.style.color = '#2F7A45';
    var tab = btn.dataset.tab;
    if (tab === 'events' && window.goToDashboard) window.goToDashboard();
    if (tab === 'people' && window.goToPeople) window.goToPeople();
    if (tab === 'settings' && window.goToSettings) window.goToSettings();
  });

  // ── Biometric lock ──
  var bioLock = document.createElement('div');
  bioLock.id = 'bio-lock';
  bioLock.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:#10344E;color:#fff;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
  bioLock.innerHTML =
    '<div style="font-size:48px;">&#128274;</div>' +
    '<div style="font-size:15px;color:rgba(255,255,255,0.7);">Unlock Out of Bounds</div>' +
    '<button id="bio-unlock-btn" style="padding:14px 32px;border:2px solid rgba(255,255,255,0.5);border-radius:999px;background:none;color:#fff;font-family:Poppins,sans-serif;font-weight:600;font-size:15px;cursor:pointer;">Unlock</button>';
  document.body.appendChild(bioLock);

  window.unlockBiometric = async function () {
    try {
      if (window.Capacitor.Plugins.NativeBiometric) {
        await window.Capacitor.Plugins.NativeBiometric.verifyIdentity({ reason: 'Unlock Out of Bounds', title: 'Out of Bounds' });
      }
      bioLock.style.display = 'none';
    } catch (e) { /* stay locked */ }
  };

  document.getElementById('bio-unlock-btn').onclick = window.unlockBiometric;

  // Show biometric on load if signed in
  setTimeout(function () {
    var hasCookie = document.cookie.indexOf('auth_token=') !== -1 || document.cookie.indexOf('organiser_id=') !== -1;
    if (!hasCookie) return;
    if (localStorage.getItem('oob-biometric') === 'off') return;
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.NativeBiometric) return;
    window.Capacitor.Plugins.NativeBiometric.isAvailable().then(function (r) {
      if (r.isAvailable) {
        bioLock.style.display = 'flex';
        window.unlockBiometric();
      }
    }).catch(function () {});
  }, 500);

  // ── Handle auth callback from system browser ──
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', function (data) {
      if (data.url && data.url.indexOf('auth/callback') !== -1) {
        if (window.Capacitor.Plugins.Browser) {
          window.Capacitor.Plugins.Browser.close().catch(function () {});
        }

        var hashPart = data.url.split('#')[1] || '';
        var params = new URLSearchParams(hashPart);
        var accessToken = params.get('access_token');
        var refreshToken = params.get('refresh_token');

        if (accessToken) {
          document.cookie = 'sb-access-token=' + accessToken + '; path=/; max-age=7776000; SameSite=Lax';
          if (refreshToken) {
            document.cookie = 'sb-refresh-token=' + refreshToken + '; path=/; max-age=7776000; SameSite=Lax';
          }

          var SB_URL = 'https://ahutmswadskdkqhnrhhh.supabase.co';
          var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc';
          if (window.supabase && window.supabase.createClient) {
            var sb = window.supabase.createClient(SB_URL, SB_ANON);
            sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(function () {
              window.location.reload();
            }).catch(function () {
              window.location.reload();
            });
          } else {
            window.location.reload();
          }
        } else {
          window.location.reload();
        }
      }
    });
  }

  // ── Block navigation outside allowed paths ──
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('javascript:')) return;
    if (href.match(/^\/(o|p|r|board|auth)(\/|$|\?|#)/)) return;
    e.preventDefault();
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      if (href.startsWith('http') || href.startsWith('/')) {
        var url = href.startsWith('/') ? window.location.origin + href : href;
        window.Capacitor.Plugins.Browser.open({ url: url }).catch(function () {});
      }
    }
  }, true);

  // ── Native sign-in: email code flow only ──
  window.nativeSignInEmail = function () {
    // Show the web email sign-in form (which has the code field)
    var authButtons = document.getElementById('auth-buttons');
    if (authButtons) authButtons.style.display = 'none';
    var magicForm = document.getElementById('magic-link-form');
    if (magicForm) magicForm.style.display = '';
    // Focus the email input
    var emailInput = document.getElementById('magic-email');
    if (emailInput) emailInput.focus();
  };

  } // end boot()
})();
