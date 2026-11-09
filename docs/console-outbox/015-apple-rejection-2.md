# Report 015: second Apple rejection fixes

Tag: ios-rc2

## 1. Guideline 4.0: bottom cropping

**Root cause:** app-shell.js set `html` and `body` to `overflow: hidden` and screens to `height: 100vh`. On iOS, `100vh` includes the area behind the home indicator bar, so the last event card and tab bar content were clipped beneath it.

**Fix:**
- Replaced `overflow: hidden` on html/body with `overflow-x: hidden` (allows vertical scroll)
- Changed `height: 100vh` to `height: 100dvh` (dynamic viewport height, accounts for browser chrome and safe areas) with `100vh` fallback for older browsers
- Added `padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px))` on `.screen.active` to clear the fixed tab bar and home indicator

Checked at both Apple test viewports:
- iPhone 17 Pro Max: 440x956 @3x — no cropping
- iPad Air 11-inch: 820x1180 @2x — no cropping

## 2. Guideline 3.1.1: tier/plan language

### Elements removed from DOM in native

| ID/selector | What it was |
|---|---|
| `#billing-upgrade` | Upgrade panel with prices |
| `#btn-upgrade` | "Upgrade to Pro" button |
| `#billing-manage` | "Manage your billing" button |
| `#billing-cancelling` | Pro cancellation notice |
| `#screen-billing` | Entire billing screen |
| `#golive-fee`, `#golive-pro-card` | Go-live fee rows and Pro card |
| `#golive-disclaimer` | "Adding a player later costs 99p" |
| `#golive-fee-base/players/total` | Payment line items |
| `#billing-save-hint` | "Save £80.88 a year" |
| `#live-paid-info` | "Included with Pro" / "Paid £x on date" |
| `#golive-pro-line` | Pro badge on go-live |
| `#btn-csv-export` | CSV export with Pro badge |
| `.price-row` | All pricing rows |
| `.pro-label` | All "Pro" badge spans |
| `.chip.pro` | All Pro chip badges |

### JS-level changes

| Location | Change |
|---|---|
| Settings rendering (~line 2814) | Billing row: not rendered in native |
| Settings rendering (~line 2816-2817) | Branding/Team rows: shown only if org has Pro, no label; hidden entirely for non-Pro in native |
| Settings rendering (~line 2828) | Admin row: hidden in native |
| api.js error mapper | Plan-related API errors ("Play plan is limited...") mapped to "This event has reached its player limit." |
| MutationObserver | Catches dynamically-injected `.pro-label` and `.chip.pro` elements |

### Forbidden string assertions

Tested at both viewports with a fresh per_event organiser (not Pro):

| String | Dashboard | Settings | Event | Finished |
|---|---|---|---|---|
| Pro | 0 | 0 | 0 | 0 |
| Play plan | 0 | 0 | 0 | 0 |
| PLAN | 0 | 0 | 0 | 0 |
| Upgrade | 0 | 0 | 0 | 0 |
| Billing | 0 | 0 | 0 | 0 |
| £ | 0 | 0 | 0 | 0 |
| paid/Paid | 0 | 0 | 0 | 0 |
| included with | 0 | 0 | 0 | 0 |
| trial | 0 | 0 | 0 | 0 |
| subscription | 0 | 0 | 0 | 0 |
| Test mode | 0 | 0 | 0 | 0 |

**Exclusions:** The word "plan" is checked as a standalone word. No occurrences found that aren't tier-related. No exclusions needed.

## 3. Guideline 2.3.3: new screenshots

All generated with `?native=1`, reviewer account, current production deploy.

### iPhone 6.9-inch (1320x2868 px)

| # | Screen | Path |
|---|---|---|
| 01 | Dashboard with events | docs/store/ios/iphone-69/01.png |
| 02 | Event detail | docs/store/ios/iphone-69/02.png |
| 03 | Finished leaderboard | docs/store/ios/iphone-69/03.png |
| 04 | Player scoring | docs/store/ios/iphone-69/04.png |
| 05 | Finished results | docs/store/ios/iphone-69/05.png |

### iPad 13-inch (2064x2752 px)

| # | Screen | Path |
|---|---|---|
| 01 | Dashboard with events | docs/store/ios/ipad-13/01.png |
| 02 | Event detail | docs/store/ios/ipad-13/02.png |
| 03 | Finished leaderboard | docs/store/ios/ipad-13/03.png |
| 04 | Player scoring | docs/store/ios/ipad-13/04.png |
| 05 | Finished results | docs/store/ios/ipad-13/05.png |

PNG header pixel sizes verified by reading bytes 16-23. No alpha, no bezels, no overlays.

## 4. Test results (all against production)

```
Full-flow:         84 of 84 steps passed
Journeys:          15 of 15 steps passed
Auth:              31 of 31 steps passed (31 total)
OTP end-to-end:     4 of  4 steps passed
Native assertions:  8 of  8 steps passed
```

Tagged `ios-rc2`.
