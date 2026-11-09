# Report 021: iPad 13-inch live screenshot and wide layout

Tag: ios-rc8

## 1. Live screen grid fix

**Root cause:** `.lgrid` in components.css used `repeat(3, 1fr)` which at 1032px in the two-column layout (left column ~620px) squeezed 3 cards to ~200px each. At narrower widths, text wrapped heavily.

**Fix:** Changed to `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` which adapts the column count to the available width. At 620px left column: 3 cards at ~200px (readable). At narrower: 2 cards. Also applied the same pattern to `.groups-grid` (the event setup groups view).

Checked at 820x1180 (iPad Air): unchanged, still 2-column layout with readable cards.
Checked at 1032x1376 (iPad 13-inch): groups display in a single column in the left pane, readable and not squished.

## 2. Screenshot ipad-13/04.png

Retaken with full wait for groups ("Thru" text present) and leaderboard (leader pts not "--"). Now shows:
- Dark livehead: "Spring Charity Classic" LIVE, "10 OF 10 GROUPS SCORING", "24 LEADING, THRU 9", "0 FINISHED"
- Two-column layout: 10 group cards with player names and "Thru 9"/"Thru 6"/"Thru 3" progress on the left; Big screen, Share, Prizes on the right
- 2064x2752 pixels confirmed

## 3. Demo-reset removed from reviewer-login

The auto demo-reset on reviewer sign-in (added in brief 016) caused a race condition: events were deleted mid-load, producing an empty dashboard. Removed the fire-and-forget call. Demo data resets nightly at 02:00 UTC and can be triggered manually from Settings > Admin.

## 4. Test results

```
Native assertions:  15 of 15 steps passed
  - iPhone dashboard: clean, no cropping
  - iPad dashboard: clean, no cropping
  - iPhone settings: clean, no cropping
  - iPad settings: clean, no cropping
  - Live: 10 group buttons, 41 leaderboard rows, leader 24 pts
  - Live: zero renderLiveView errors
  - Live: no forbidden text
  - Finished: no forbidden text
  - Zero critical console errors
```

Tagged ios-rc8.
