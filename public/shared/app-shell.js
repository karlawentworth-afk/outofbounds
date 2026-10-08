/**
 * app-shell.js — Native app shell. Every native-only element
 * is created here and nowhere else. This file is a no-op on
 * the web: the very first line bails if Capacitor is absent.
 */
(function () {
  'use strict';

  // ── Gate: web gets nothing ──
  // Capacitor bridge may not be ready yet on remote-loaded apps.
  // Check immediately, and also listen for the bridge to load.
  window.OOB = window.OOB || {};

  function checkNative() {
    try { return window.Capacitor && window.Capacitor.isNativePlatform(); } catch (e) { return false; }
  }

  // Also detect via user agent as fallback (Capacitor adds its own UA string)
  var uaHint = navigator.userAgent.indexOf('Capacitor') !== -1;
  var isNative = checkNative() || uaHint;
  window.OOB.native = !!isNative;
  if (!isNative) return;

  // ── Mark the document ──
  document.documentElement.classList.add('native-app');

  // ── Inject native-only CSS ──
  var css = document.createElement('style');
  css.textContent = [
    /* Hide web-only chrome */
    '.native-app #install-banner { display: none !important; }',
    '.native-app #billing-upgrade { display: none !important; }',
    '.native-app #btn-upgrade { display: none !important; }',
    '.native-app #billing-manage { display: none !important; }',

    /* Safe area on top bar — add inset to existing padding */
    '.native-app .top-bar { padding-top: calc(14px + env(safe-area-inset-top, 0px)); min-height: calc(56px + env(safe-area-inset-top, 0px)); }',

    /* Pad content for bottom tab bar */
    '.native-app .container { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }',

    /* Sign-in: replace web version with native welcome */
    '.native-app #screen-signin .logo-big,',
    '.native-app #screen-signin h2,',
    '.native-app #screen-signin .sub,',
    '.native-app #screen-signin .auth-btns,',
    '.native-app #screen-signin .magic-link-form,',
    '.native-app #screen-signin > p { display: none !important; }',
    '.native-app #screen-signin { background: var(--navy) !important; }',
  ].join('\n');
  document.head.appendChild(css);

  // ── Native welcome screen (injected into sign-in) ──
  var signin = document.getElementById('screen-signin');
  if (signin) {
    var wel = document.createElement('div');
    wel.id = 'native-welcome';
    wel.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;width:100%;';
    wel.innerHTML =
      '<img src="/img/icon-white.png" alt="" style="height:80px;margin-bottom:24px;">' +
      '<div style="font-family:Poppins,sans-serif;font-size:28px;font-weight:800;color:#fff;margin-bottom:40px;letter-spacing:-0.02em;">Out of Bounds</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;width:min(320px,100%);">' +
        '<button onclick="nativeSignInApple()" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 24px;border-radius:999px;font-family:Poppins,sans-serif;font-weight:600;font-size:16px;cursor:pointer;background:#fff;color:#000;border:none;">' +
          '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>' +
          'Continue with Apple</button>' +
        '<button onclick="nativeSignInGoogle()" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 24px;border-radius:999px;font-family:Poppins,sans-serif;font-weight:600;font-size:16px;cursor:pointer;background:#fff;color:#333;border:none;">' +
          '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>' +
          'Continue with Google</button>' +
        '<button onclick="nativeSignInEmail()" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 24px;border-radius:999px;font-family:Poppins,sans-serif;font-weight:600;font-size:16px;cursor:pointer;background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.5);">' +
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
    if (tab === 'people') {
      if (window.goToPeople) window.goToPeople();
      else if (window.toast) window.toast('People directory coming soon');
    }
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
    if (!window.Capacitor.Plugins.NativeBiometric) return;
    window.Capacitor.Plugins.NativeBiometric.isAvailable().then(function (r) {
      if (r.isAvailable) {
        bioLock.style.display = 'flex';
        window.unlockBiometric();
      }
    }).catch(function () {});
  }, 500);

  // ── Handle auth callback from system browser ──
  // When the custom URL scheme opens the app, close the browser and reload
  if (window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', function (data) {
      // Custom scheme callback: com.outofboundsevents.scoring://auth/callback
      if (data.url && data.url.indexOf('auth/callback') !== -1) {
        // Close the system browser overlay
        if (window.Capacitor.Plugins.Browser) {
          window.Capacitor.Plugins.Browser.close().catch(function () {});
        }
        // Reload the page to pick up the auth cookies
        setTimeout(function () {
          window.location.reload();
        }, 300);
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
    if (href.startsWith('http') || href.startsWith('/')) {
      var url = href.startsWith('/') ? window.location.origin + href : href;
      window.Capacitor.Plugins.Browser.open({ url: url }).catch(function () {});
    }
  }, true);

  // ── Native sign-in handlers ──
  var SB_URL = 'https://ahutmswadskdkqhnrhhh.supabase.co';
  var redirectUrl = 'https://score.outofboundsevents.com/auth/callback';

  window.nativeSignInApple = function () {
    window.Capacitor.Plugins.Browser.open({ url: SB_URL + '/auth/v1/authorize?provider=apple&redirect_to=' + encodeURIComponent(redirectUrl), presentationStyle: 'popover' });
  };
  window.nativeSignInGoogle = function () {
    window.Capacitor.Plugins.Browser.open({ url: SB_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectUrl), presentationStyle: 'popover' });
  };
  window.nativeSignInEmail = function () {
    var wel = document.getElementById('native-welcome');
    if (wel.querySelector('.nw-email-form')) return;
    var form = document.createElement('div');
    form.className = 'nw-email-form';
    form.style.cssText = 'width:min(320px,100%);margin-top:16px;';
    form.innerHTML =
      '<input type="email" id="nw-email" placeholder="you@example.com" autocomplete="email" style="width:100%;padding:14px 16px;border:2px solid rgba(255,255,255,0.3);border-radius:12px;font-size:16px;font-family:inherit;outline:none;background:rgba(255,255,255,0.1);color:#fff;margin-bottom:12px;">' +
      '<button onclick="nativeSendMagicLink()" style="display:flex;align-items:center;justify-content:center;width:100%;padding:16px 24px;border-radius:999px;font-family:Poppins,sans-serif;font-weight:600;font-size:16px;cursor:pointer;background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.5);">Send magic link</button>' +
      '<div id="nw-email-sent" style="display:none;color:rgba(255,255,255,0.8);font-size:14px;margin-top:12px;">Check your inbox for the sign-in link.</div>';
    wel.appendChild(form);
    form.querySelector('input').focus();
  };
  window.nativeSendMagicLink = function () {
    var email = document.getElementById('nw-email').value.trim();
    if (!email) return;
    var sb = window.supabase && window.supabase.createClient ? null : null;
    // Use fetch directly to Supabase OTP endpoint
    fetch(SB_URL + '/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': document.querySelector('[data-anon-key]') ? document.querySelector('[data-anon-key]').dataset.anonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRtc3dhZHNrZGtxaG5yaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk2NTEsImV4cCI6MjEwNTY0NTY1MX0.sV9wHdMfiEwIdErw9ISwELf68e00_UEXv3SmWkSdoQc' },
      body: JSON.stringify({ email: email, gotrue_meta_security: {} })
    }).then(function () {
      document.getElementById('nw-email-sent').style.display = '';
    });
  };

})();
