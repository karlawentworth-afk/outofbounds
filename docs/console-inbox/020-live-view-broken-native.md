# Brief 020: the organiser live screen is broken in native (since 015). Fix first, nothing else.

Claude, 9 Nov, production, reviewer account, native mode, Spring Charity Classic (live, seeded with scores). Dashboard card: "9 of 10 groups scoring · leader 24 pts thru 9". The live screen: "-- LEADING, 0 FINISHED", "Nobody has scored yet", no group buttons. Console log, repeated on every poll:

    renderLiveView error: TypeError: Cannot read properties of null (reading 'style')
        at renderLiveView (/o/?native=1:4586)

Line ~4582: `var paidEl = $('live-paid-info'); ... paidEl.style.display = ...`. app-shell.js removes `#live-paid-info` from the DOM in native (brief 015), so paidEl is null, the function throws, and renderLiveGroups / renderLiveLeaderboard never run. The `leaderboard` function is never even requested (confirmed in the network log). This has been live on production and in the Android app since 31 Oct. Your screenshot 04 from brief 019 shows this broken state and was reported as correct.

## 1. Fix

- Guard every `$('...')` lookup in renderLiveView and in anything else that runs in native: `if (el)`. Specifically remove the paid-info block entirely in native (isNativeApp() → skip), and null-guard it on the web.
- Make the live screen resilient: head stats, groups, leaderboard, share, prizes each render inside their own try/catch so one failure cannot blank the others. Log each failure with the section name.
- Audit the whole list of elements app-shell.js removes in native (screen-billing, golive-fee, golive-pro-card, golive-disclaimer, golive-fee-*, golive-total, billing-save-hint, live-paid-info, golive-pro-line, btn-csv-export, pro-label, chip.pro, golive-native-block, golive-pro-note, team-desc text). For each, grep every JS reference and prove it is null-safe. List them in the report with line numbers.

## 2. Tests that would have caught it

- Native mode, reviewer account, production: open the live demo event. Assert: 10 group buttons rendered in #live-groups-list; #live-leaderboard has at least 20 rows with points; livehead leader shows a number not "--"; the `leaderboard` function was requested. Fail if any console error contains "renderLiveView".
- Same assertions for the finished demo event (Results tab shows a winner with points and a leaderboard).
- Zero console errors across the whole native walk (dashboard, each event, settings, branding, team, people). Add this to the native assertions: any `console.error` fails the run.
- Run the same live-screen assertion on the web (no native flag) so both paths are covered.

## 3. Screenshots 04 (both sizes) again

After the fix is deployed: Spring Charity Classic, Live tab, with the ten groups and the leaderboard showing points. Check it yourself before saving. And iPhone 02 shows "No groups yet" under a header that says "10 groups": capture after the groups list has rendered (the iPad 02 is fine, match it).

## 4. Prove and tag

Deploy, confirm, run everything (full-flow, journeys, auth, native assertions incl. the new ones, cropping, dashboard timing) against production. Paste the tails. Tag `ios-rc7` only when all green and zero console errors.

Report to docs/console-outbox/020-live-view-broken-native.md. Commit, push, wait-inbox.
