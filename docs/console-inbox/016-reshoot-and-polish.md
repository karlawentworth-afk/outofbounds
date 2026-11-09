# Brief 016: fix what the reviewer will see, then reshoot the screenshots

Claude walked production in native mode at 440x956 as the reviewer account on 9 Nov after ios-rc2. The code fixes in 015 hold (no tier words found on sign-in, dashboard, settings, branding, team, event set-up, add-players sheet, live event; lists scroll to the end; reviewer code flow works). But the screenshots are not acceptable and three things the reviewer will see need fixing first. Do NOT resubmit; Claude uploads, replies and resubmits.

## 1. Dashboard is blank for ~5 seconds after sign-in

Measured: `org-events?organiser_id=a0000000-...` takes 4.8 to 5.0 s on production for the demo org (org-auth 420 ms, org-branding 700 ms, so it is not a cold start). During that time the dashboard shows only "Good morning, Dave" and the tab bar. Your own screenshot 01 captured that blank state. A reviewer reads it as an empty or broken events screen.

Fix both halves:
- Make org-events fast. Profile it: it is almost certainly per-event queries (player counts, groups, winners) in a loop. Collapse to one or two queries. Target under 800 ms for the demo org on production. Paste before and after timings from production.
- Add a loading state to the dashboard: skeleton cards or a "Loading your events" line under the greeting from the moment the screen shows until the list renders. Same on the People screen and the event screen if they have any fetch delay. Never a blank screen.

## 2. Demo data looks broken

- "Autumn Invitational" (finished, Better Ball 2from4, 36 players) has 24 leaderboard entries all on 0 pts and the results card says "Michelle Collins wins with 0 pts". Fix the seed so it has a full set of realistic scores and a proper winner, or remove it. Check every finished demo event the same way: no finished event may show 0 pts or "Event complete." with no winner.
- Two identical "May Society Day 2027" drafts. Keep one.
- Claude accidentally put "Winter Warm-Up" live while testing (it is now status live with no scores). The seed should give the demo org: one draft, one ready, one live with partial scores coming in (realistic: 6 of 10 groups through 9 holes), and three or four finished with results. Run demo-reset after fixing the seed and confirm what the reviewer sees on the dashboard.
- Confirm when demo-reset runs. If it is not automatic on reviewer sign-in, make it so (or on each sign-in of review@outofboundsevents.com), so the reviewer always starts from the seeded state whatever the last reviewer did.

## 3. Small wording

- Team screen in native: "No extra charge." Remove the sentence in native (keep it on the web).
- Opening an existing event flashes the "New event" wizard (step 1, empty fields) before the event loads. This is the openEvent-before-load fallback found in brief 007. Guard it: show the event screen in a loading state, never the wizard, when an id is given.
- The add-players sheet: tapping Cancel at 440x956 did not close it for Claude (closeSheet() from the console did). Verify by tap in Playwright with touch on, and fix if the overlay is intercepting.

## 4. Reshoot the screenshots (after 1 to 3 are live on production)

Same sizes as 015 (1320x2868 and 2064x2752, PNG, RGB). Use the demo org after demo-reset. Wait for every list to finish loading before capturing (assert the content is present; never capture a loading or blank state). Five per size, in this order, same screens on both:

1. Dashboard with the events list visible: the live event at the top with scores coming in, the ready one, then finished ones with winners. Scroll position at the top.
2. A ready or live event's Groups tab: groups with names and tee times visible.
3. The live event's Live tab with the leaderboard showing real positions and points (not "Nobody has scored yet").
4. The player scoring screen from /p/ for the live event, mid-round: hole number, par, SI, the group's players with scores entered and the keypad or save bar visible.
5. A finished event's Results tab with a real winner and points, the leaderboard visible below. Not Autumn Invitational unless it has been fixed.

Look at all ten yourself before saving. Reject any with a blank area, a loading state, 0 pts, duplicate events or clipped bottoms. Overwrite docs/store/ios/iphone-69/01-05.png and docs/store/ios/ipad-13/01-05.png and commit.

## 5. Prove it

Push, confirm the production deploy, then run everything: full-flow, journeys, auth, OTP end-to-end, native DOM assertions (add "No extra charge" and "charge" to the forbidden list), the cropping test. Paste the tails. Add a dashboard-loads-within-2s assertion in native mode against production. Tag `ios-rc3` only when everything passes.

Report to docs/console-outbox/016-reshoot-and-polish.md: org-events timings before and after, the seed changes, the demo-reset trigger, the wording/guard fixes with line references, and a short description of what each of the ten screenshots shows. Commit, push, wait-inbox.

## 6. Addendum from Claude's reviewer walk (added same day)

- Go-live tab, Pro organiser: line ~4431 writes "N players ready · Included with Pro" into `#golive-pro-note`. The report says `#golive-pro-card` is removed in native, which would take the note with it; prove it with the reviewer account on a READY event's Go live tab (the native assertions only used a per_event organiser). Either way, change the native text to "N players ready" with no suffix.
- The go-live code decides native with `window.Capacitor.isNativePlatform()` only (line ~4427), so `?native=1` testing never exercises the native branch. Use `isNativeApp()` there and everywhere else, so what Claude and the suite test with `?native=1` is what the app runs.
- Non-Pro organiser in native (a reviewer who signs up with their own email will be one): the Go live tab hides the button and shows "This event isn't active yet. Manage your account on the web." That sentence steers the user to the web to pay, which is exactly what 3.1.1 punishes, and it leaves a new organiser unable to use the app at all. Karla is deciding the policy (see her reply); do not change behaviour until she has, but prepare the change so it is a one-line switch: server-side in stripe-checkout, treat a go-live request from the native app (header or body flag set by the app shell, not trusted from the web) the same as Pro: set live and paid, return free. Remove `#golive-native-block` from the native DOM entirely.
- Adding a player to a live Play-plan event in native silently skips the top-up (line ~3785). Fine, but the toast must say "Player added" only; confirm no "99p" text can reach native.
- Apple will also tap "Open big screen", "Print a QR poster" and the share links. In native those open /board and /r pages inside the app. Confirm each has a way back to the organiser screen (a Back control or the app shell's back handling) and that the /r page's promo is suppressed when opened from the app without `?native=1` in the URL (it checks Capacitor; confirm it).
