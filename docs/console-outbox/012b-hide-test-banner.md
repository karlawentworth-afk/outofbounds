# Report 012b: hide test-mode banner in native

## 1. Fix

`showTestBanner()` in public/shared/api.js now:
- Returns early when `isNativeApp()` is true or `?native=1` is in URL
- On web, only renders for superadmins (checks `localStorage.getItem('oob-superadmin')`)

## 2. DOM scan at 820x1180 with ?native=1

Signed in as reviewer on production. Scanned innerText of each screen for `£\d`, `Upgrade`, `Test mode`, and `outofboundsevents.com` (excluding mailto and review@ in script):

| Screen | £ | Upgrade | Test mode | outofboundsevents.com |
|---|---|---|---|---|
| Dashboard | 0 | 0 | 0 | 0 |
| Event (Autumn Invitational, finished) | 0 | 0 | 0 | 0 |
| Settings | 0 | 0 | 0 | 0 |

All zero. No pricing, no upgrade, no test banner, no marketing links visible in native mode.
