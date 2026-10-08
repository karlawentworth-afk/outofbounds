/**
 * Native app mode detection and behaviour.
 * Loaded on every page. Sets window.OOB.native = true when
 * running inside the Capacitor shell.
 */
(function () {
  'use strict';

  window.OOB = window.OOB || {};

  // Detect Capacitor native platform
  var isNative = false;
  try {
    isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  } catch (e) {}
  window.OOB.native = isNative;

  if (!isNative) return;

  // ── Add native-mode class to html element ──
  document.documentElement.classList.add('native-app');

  // ── Block navigation outside /o/, /p/, /r/, /board/, /auth/ ──
  // Links to marketing site, billing, etc. open in system browser
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';

    // Relative paths that should stay in-app
    if (href.match(/^\/(o|p|r|board|auth)(\/|$|\?|#)/)) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('javascript:')) return;

    // Same-origin paths outside allowed areas → system browser
    if (href.startsWith('/')) {
      e.preventDefault();
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: window.location.origin + href });
      }
      return;
    }

    // External URLs → system browser
    if (href.startsWith('http')) {
      e.preventDefault();
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: href });
      }
      return;
    }
  }, true);

  // ── Hide web-only elements ──
  var style = document.createElement('style');
  style.textContent = [
    // Hide install banner, marketing footer, cookie notices
    '.native-app #install-banner { display: none !important; }',
    '.native-app .nav-marketing { display: none !important; }',
    '.native-app .cookie-notice { display: none !important; }',

    // Native sign-in screen
    '.native-app #screen-signin { background: var(--navy) !important; }',
    '.native-app #screen-signin .logo-big { display: none; }',
    '.native-app #screen-signin h2 { display: none; }',
    '.native-app #screen-signin .sub { display: none; }',
    '.native-app #screen-signin .magic-link-form { display: none; }',
    '.native-app #screen-signin > p { display: none; }',

    // Native welcome content (shown via JS)
    '.native-welcome { display: none; }',
    '.native-app .native-welcome { display: flex !important; flex-direction: column; align-items: center; justify-content: center; text-align: center; width: 100%; }',
    '.native-welcome .nw-mark { height: 80px; margin-bottom: 24px; }',
    '.native-welcome .nw-title { font-family: Poppins, sans-serif; font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 40px; letter-spacing: -0.02em; }',
    '.native-welcome .nw-btns { display: flex; flex-direction: column; gap: 12px; width: min(320px, 100%); }',
    '.native-welcome .nw-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 16px 24px; border-radius: 999px; font-family: Poppins, sans-serif; font-weight: 600; font-size: 16px; cursor: pointer; border: 2px solid rgba(255,255,255,0.5); background: transparent; color: #fff; transition: all .15s; }',
    '.native-welcome .nw-btn:active { transform: translateY(1px); }',
    '.native-welcome .nw-btn.apple { background: #fff; color: #000; border-color: #fff; }',
    '.native-welcome .nw-btn.google { background: #fff; color: #333; border-color: #fff; }',
    '.native-welcome .nw-btn.email { background: transparent; color: #fff; }',
    '.native-welcome .nw-btn svg { width: 20px; height: 20px; flex-shrink: 0; }',

    // Bottom tab bar
    '.native-app .native-tab-bar { display: flex !important; }',
    '.native-tab-bar { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: calc(56px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); background: #fff; border-top: 1px solid var(--line); z-index: 100; align-items: center; justify-content: space-around; }',
    '.native-tab-bar .tab-item { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; border: none; background: none; font-family: inherit; padding: 8px 16px; }',
    '.native-tab-bar .tab-item.active { color: var(--green); }',
    '.native-tab-bar .tab-item svg { width: 22px; height: 22px; }',

    // Adjust content for tab bar
    '.native-app .container { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }',

    // Hide web top bar in native mode — app uses its own
    '.native-app .top-bar { padding-top: env(safe-area-inset-top, 0px); }',

    // Biometric lock screen
    '.bio-lock { display: none; position: fixed; inset: 0; z-index: 9999; background: var(--navy); color: #fff; align-items: center; justify-content: center; flex-direction: column; gap: 16px; }',
    '.bio-lock.show { display: flex; }',
    '.bio-lock .bio-icon { font-size: 48px; }',
    '.bio-lock .bio-text { font-size: 15px; color: rgba(255,255,255,0.7); }',
    '.bio-lock .bio-btn { padding: 14px 32px; border: 2px solid rgba(255,255,255,0.5); border-radius: 999px; background: none; color: #fff; font-family: Poppins, sans-serif; font-weight: 600; font-size: 15px; cursor: pointer; }',

    // Hide billing/payment in native
    '.native-app #billing-upgrade { display: none !important; }',
    '.native-app #btn-upgrade { display: none !important; }',
    '.native-app #billing-manage { display: none !important; }',
    '.native-app .billing-link { display: none !important; }',
  ].join('\n');
  document.head.appendChild(style);

})();
