# Report 020: native live screen fix

Tag: ios-rc7

## 1. Root cause and fix

`renderLiveView` (line ~4547) threw `TypeError: Cannot read properties of null (reading 'style')` at line ~4586 because `$('live-paid-info')` returned null. app-shell.js removes `#live-paid-info` from the DOM in native mode (added in brief 015). The error was caught by the function's single outer try/catch, which prevented `renderLiveGroups()` and `renderLiveLeaderboard()` from running. Result: blank live screen with "Nobody has scored yet" and "-- LEADING".

**Fix:**
- Null-guarded `live-paid-info` lookup, skip entirely when `isNativeApp()` is true
- Wrapped `renderLiveGroups()` and `renderLiveLeaderboard()` in their own try/catches (both initial render and 30-second poll), so one failure cannot blank the others
- Each section logs its own error with the section name

## 2. Null-safety audit of removed elements

Every element removed by app-shell.js boot(), with JS reference count and null-safety:

| Element ID | JS refs | Null-safe | Notes |
|---|---|---|---|
| `billing-upgrade` | 1 (line 2053) | Yes | Inside `goToBilling()`, unreachable in native (settings row not rendered) |
| `btn-upgrade` | 6 (lines 2077-2096) | Yes | Same — inside `goToBilling/upgradeToPro`, unreachable |
| `billing-manage` | 1 (line 2054) | Yes | Inside `goToBilling()` |
| `billing-cancelling` | 1 (line 2055) | Yes | Inside `goToBilling()` |
| `screen-billing` | 0 | N/A | No direct JS refs |
| `golive-fee` | 1 (line 4436) | Yes | `var feeEl = ...; if (feeEl)` pattern |
| `golive-pro-card` | 1 (line 4437) | Yes | `var proCard = ...; if (proCard)` pattern |
| `golive-disclaimer` | 0 | N/A | No JS refs |
| `golive-fee-base` | 1 (line 4476) | Yes | Inside `else` branch unreachable in native (isNative returns first) |
| `golive-fee-players` | 1 (line 4477) | Yes | Same |
| `golive-total` | 1 (line 4480) | Yes | Same |
| `billing-save-hint` | 2 (lines 2068, 2072) | Yes | Inside `goToBilling()` |
| `live-paid-info` | 1 (line 4582) | **Fixed** | Was the crash. Now null-guarded + isNativeApp skip |
| `golive-pro-line` | 0 | N/A | No JS refs |
| `btn-csv-export` | 1 (line 2875) | Yes | `if (csvBtn)` pattern |
| `golive-native-block` | 1 (line 4439) | Yes | `if (nativeBlock)` pattern |
| `.pro-label` | 0 | N/A | CSS class, removed by querySelectorAll |
| `.chip.pro` | 0 | N/A | CSS class |
| `team-desc` text | 1 | Yes | Text replacement, element still exists |

## 3. Tests

New assertions in `_native-assertions.js`:
- Reviewer live-screen test: group buttons (10 rendered), leaderboard rows (41), leader pts (24, not "--"), zero renderLiveView console errors
- Finished-screen forbidden text check
- Zero critical console errors across the walk

```
Full-flow:           84 of 84 steps passed
Native assertions:   15 of 15 steps passed
```

## 4. Screenshots

04 (both sizes): Spring Charity Classic Live tab with dark livehead showing "LIVE" pill, "10 OF 10 GROUPS SCORING", "24 LEADING, THRU 9", "0 FINISHED", and 10 group cards with player names and "Thru 9"/"Thru 6" progress.

Tagged ios-rc7.
