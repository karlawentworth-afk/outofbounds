# Brief 019: native go-live fails on production and leaks the price

Claude's fresh-organiser walk on production (9 Nov, ios-rc5): new organiser signed up by email code in native mode, created "Reviewer Test Day" (Riverside GC, 4 players), tapped Go live. Result: stripe-checkout returned 500 with

    Supabase 400: PGRST204 Could not find the 'paid_source' column of 'events' in the schema cache

and the client then relabelled the button "Pay £13.95 and go live". The event stayed draft. So brief 017's "native go-live free" does not work on production and the price is back in the native app on the one journey a reviewer takes when they sign up themselves. Your 017 test cannot have run against production; say in the report where it ran.

## 1. Fix the server

- Do not write `paid_source` to events until the column exists. Either add a migration AND apply it to production before the code ships (if you can apply migrations, do it and show the column exists with a query against production; if you cannot, do not ship code that depends on it), or record the source without a new column: `paid_amount_pence: 0` and an audit_log / activity_log entry `go_live_native_free` which already has a table.
- Check every other write added in 015 to 018 for columns that are not in production (`counted_holes` on events from 018 is the obvious one). List each column your code reads or writes that was added since 1 Nov and prove it exists in production or remove the dependency.

## 2. Fix the client

- In native mode the Go live button never shows a price, whatever the server returns. On any error: "Couldn't go live. Try again in a moment." and the button goes back to "Go live".
- Grep for every place that composes "Pay " + formatPrice and guard each with isNativeApp().
- Add "Pay " and "and go live" to the native forbidden-string list.

## 3. Prove it on production, as a new organiser

Using a brand-new mailinator address with OTP_E2E=1, in native mode (`?native=1`, which now sends the X-OOB-Native header) against https://score.outofboundsevents.com:
1. Sign up, onboarding, dashboard.
2. Create an event with a course and tees, paste 4 players, sort into groups (note: "Sort players into groups" left "4 players in 0 groups" for Claude when no start mode was chosen; make the default Tee times so sorting always makes groups).
3. Go live. Assert: status live, response free, no Stripe session, and no "£" anywhere on screen before, during or after.
4. Open the live tab, the share link and the big-screen link; assert no "£" and a way back.
5. Sign out. Sign in as the reviewer; assert the demo reset happened and Winter Warm-Up is Ready and stays Ready when step 4 is tapped.
Paste the transcript. Clean up the test organiser.

Also the web: a per_event organiser on the web still gets the fee rows and a Stripe URL. Prove with one request without the header.

## 4. Screenshots 02 and 04

Still wrong after two briefs. Fix the script properly: sign in as the reviewer with the code, read the event ids and player tokens from the API at run time, then:
- 02: Winter Warm-Up, Groups tab, groups with names and tee times.
- 04: Spring Charity Classic, Live tab, leaderboard with positions and points.
Both sizes. Overwrite and commit. Do not report this brief done with 02 or 04 outstanding.

## 5. Tests

The 82/84 in 018 is not green. Name the two failing steps and fix or explain each; "likely timing flakes" is not an explanation. Then run everything against production and tag `ios-rc6` only when it is all green.

Report to docs/console-outbox/019-native-go-live-broken.md. Commit, push, wait-inbox.
