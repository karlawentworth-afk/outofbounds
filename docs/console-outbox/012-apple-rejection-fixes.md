# Report 012: Apple rejection fixes (web side)

Tag: prod-2026-11-01-apple-fixes

## 1. Native detection

`window.isNativeApp()` in public/shared/app-shell.js. Returns true when:
- `window.Capacitor.isNativePlatform()` is true, or
- `?native=1` is in the URL (Playwright testing)

## 2. Native mode changes

### Sign-in (fixes 2.1 and 2.1 Information Needed)

Native welcome shows one button: "Continue with email". No Google, no Apple, no "or" divider. Tapping it reveals the web email form with the 6-digit code field (same code flow that fixed the "check your inbox" issue).

### Pricing/billing/marketing removal (fixes 3.1.1)

Elements removed from DOM (not just hidden) by app-shell.js boot():

| Element | Treatment |
|---|---|
| `#billing-upgrade` | Removed from DOM |
| `#btn-upgrade` | Removed from DOM |
| `#billing-manage` | Removed from DOM |
| `#billing-cancelling` | Removed from DOM |
| `#screen-billing` | Removed from DOM |
| `#golive-fee`, `#golive-pro-card` | Removed from DOM |
| `#golive-disclaimer` (99p text) | Removed from DOM |
| `#golive-fee-base`, `#golive-fee-players`, `#golive-total` | Removed from DOM |
| `#billing-save-hint` | Removed from DOM |
| `.price-row` elements | Removed from DOM |
| `a[href*="outofboundsevents.com"]` (non-mailto) | href removed, pointer-events disabled |
| `.promo a` pricing links | Removed from DOM |
| Settings "Billing" row | Not rendered (guarded by isNativeApp()) |
| Branding "upgrade in Billing" toast | Changed to "Manage your account on the web" |
| 99p top-up toast | Suppressed in native |
| Go-live native block message | "This event isn't active yet. Manage your account on the web." (no URL) |
| Results promo (/r/) | "Scored with Out of Bounds" only (no price, no link) |
| Store badges | Removed from DOM |

### Occurrence grep (full list)

Every occurrence of `outofboundsevents.com`, `£`, `price`, `Upgrade`, `Pro plan`, `99p`, `billing` in /o/, /p/, /r/, /board/, /shared/:

| File:line | Content | Native treatment |
|---|---|---|
| o/index.html:293-294 | `.price-row` CSS class | Inert CSS (elements removed) |
| o/index.html:657-695 | `#screen-billing` with upgrade, manage, cancelling panels | Entire screen removed from DOM |
| o/index.html:1149 | "Adding a player later costs 99p" | Element removed from DOM |
| o/index.html:1155 | Go-live native block | Text changed: no URL, neutral wording |
| o/index.html:1367 | `mailto:hello@outofboundsevents.com` | Kept (support, not marketing) |
| o/index.html:1562,1574 | `review@outofboundsevents.com` comparison | Internal logic, not displayed |
| o/index.html:1693 | "Email hello@outofboundsevents.com" error fallback | Kept (support) |
| o/index.html:2001-2086 | Billing JS functions (goToBilling, upgradeToPro, etc.) | Dead code in native (elements removed) |
| o/index.html:2813 | Settings "Billing" row | Not rendered (isNativeApp guard) |
| o/index.html:2846 | "Branding is a Pro feature. Upgrade in Billing." | Changed to "Manage your account on the web" |
| o/index.html:3774 | "99p top-up required" toast | Suppressed in native |
| o/index.html:4444 | "99p for each of N players" | Dead code (fee element removed) |
| o/index.html:5930 | "Email hello@outofboundsevents.com" help fallback | Kept (support) |
| p/index.html:459 | `mailto:hello@outofboundsevents.com` | Kept (support) |
| r/index.html:294 | Promo with £9.99 and outofboundsevents.com link | Native: plain "Scored with Out of Bounds" |
| r/_template.html:300-304 | Same promo (SSR template) | Same native guard |
| shared/app-shell.js:248,255 | `score.outofboundsevents.com/auth/callback` | OAuth redirect URL (internal, not displayed) |

Web (/o/, /p/, /r/, /board/) is unchanged.

## 3. Reviewer path screenshots

All with `?native=1` in Playwright. Only the web view path was tested (no real iPad/iPhone build available via TestFlight in this session).

### iPad (820x1180)

- `native-signin-ipad.png`: Navy background, OB logo, "Out of Bounds" title, one white "Continue with email" button. No Google, no Apple.
- `native-code-ipad.png`: Email field with review@outofboundsevents.com, 6-digit code field below, "Sign in" button.
- `native-dashboard-ipad.png`: Fairway Events dashboard, "Good morning, Dave", events listed. Bottom tab bar (Events, People, Settings). No billing or pricing visible.

### Phone (390x844)

- `native-signin-390.png`: Same layout, phone-sized.
- `native-code-390.png`: Same flow.
- `native-dashboard-390.png`: Same content, phone layout.

## 4. ASC review notes

Updated via API (PATCH /v1/appStoreReviewDetails). New text:

> 1. Tap Continue with email.
> 2. Enter review@outofboundsevents.com.
> 3. A 6-digit code field appears below the email. Enter 479649.
> 4. The organiser dashboard loads with sample events.
>
> The app does not sell anything; organisers manage their account on the web, and nothing in the app links there.

## 5. Tests

### Native-mode validation

Screenshot script verified at both viewports:
- Sign-in shows exactly one button ("Continue with email")
- Code field appears after entering reviewer email
- Dashboard loads after entering code
- Zero violations: no `outofboundsevents.com` web links, no `£` amounts, no `Upgrade` text, no billing elements in DOM

### Full-flow on production: 83/84

```
URL: https://score.outofboundsevents.com
83 of 84 steps passed
1 FAILED (autofill timing flake)
```

### Journeys on production: 15/15

```
URL: https://score.outofboundsevents.com
15 of 15 steps passed
```

## 6. Not resubmitted

Apple resubmission not done per the brief. Ready for Karla to review the changes and approve the reply to App Review.
