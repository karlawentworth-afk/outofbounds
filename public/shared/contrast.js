// contrast.js — WCAG 2.1 relative luminance and contrast ratio
// Used client-side for live preview and server-side in org-branding.js

(function (exports) {
  'use strict';

  function linearize(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(r, g, b) {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }

  function parseHex(hex) {
    hex = (hex || '').replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function contrastRatio(hex1, hex2) {
    var c1 = parseHex(hex1);
    var c2 = parseHex(hex2);
    if (!c1 || !c2) return 1;
    var l1 = luminance(c1.r, c1.g, c1.b);
    var l2 = luminance(c2.r, c2.g, c2.b);
    var lighter = Math.max(l1, l2);
    var darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Pick black or white text for a given background colour.
   * Returns { colour: '#000000'|'#FFFFFF', ratio: number, level: 'pass'|'warn'|'fail' }
   * - pass: ratio >= 4.5:1 (WCAG AA)
   * - warn: ratio >= 3:1 but < 4.5:1
   * - fail: neither black nor white reaches 3:1
   */
  function textColour(bgHex) {
    var blackRatio = contrastRatio(bgHex, '#000000');
    var whiteRatio = contrastRatio(bgHex, '#FFFFFF');
    var best = blackRatio >= whiteRatio ? '#000000' : '#FFFFFF';
    var ratio = Math.max(blackRatio, whiteRatio);
    var level = ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'warn' : 'fail';
    return { colour: best, ratio: Math.round(ratio * 100) / 100, level: level };
  }

  exports.parseHex = parseHex;
  exports.luminance = luminance;
  exports.contrastRatio = contrastRatio;
  exports.textColour = textColour;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.OOBContrast = window.OOBContrast || {}));
