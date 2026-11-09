# Brief 018: sign-in emails rate limited, seed paid flag, two screenshots

From Claude's second reviewer walk on ios-rc4 (9 Nov). Do NOT resubmit; Claude does that.

## 1. send-otp returns 429 for a new address

A fresh sign-up (oob-applewalk-91109@mailinator.com) on production got 429 from send-otp (Supabase GoTrue email rate limit) and the app showed "We couldn't send the code. Try again in a moment." The hourly limit has been consumed by today's test runs: the OTP end-to-end test sends a real email every time the suite runs. Karla is raising the Supabase limit herself (Authentication > Rate Limits). Your part:

- Run the OTP end-to-end test only when explicitly asked or when tagging (an env flag such as `OTP_E2E=1`), never as part of the default full-flow run. Document this in tests/README or the test file header.
- Count how many sign-in emails the full suite sends per run today (every path: OTP test, journeys, full-flow) and get it to zero for ordinary runs. Use the reviewer code path or pre-seeded sessions for everything except the one explicit OTP test.
- Client: on a 429 from send-otp show "Too many sign-in emails right now. Please try again in a few minutes." with the button re-enabled after 60 seconds, and log the status. Never the generic "couldn't send" for a 429.
- Server: pass the 429 through with a `retry_after` field in the JSON so the client can show a time.

## 2. Seed: the ready event is marked paid

scripts/seed-demo.js line ~414 sets `paid: true` for the "ready" event (Winter Warm-Up, isReady). The client treats `ev.paid` as live (`if (ev.status === 'live' || ev.paid)` in updateGoLiveTab), so the moment the reviewer taps its step 4 tab the event goes live with no Go live button and no confirmation. Claude reproduced it twice after demo-reset.

- Ready event: `paid: false`, `paid_at: null`, status draft, players and groups assigned. Tapping step 4 must show the review summary and a Go live button, and going live must require that button.
- Check the live event in the seed still renders as live (status live, paid true) and the finished ones as finished.
- Dashboard card for Thursday Evening 9 says "Event complete." while the other finished cards say "Won by ...". Make every finished card show the winner.
- Run demo-reset and confirm on production with the reviewer account: open Winter Warm-Up, tap step 4, event stays Ready until Go live is tapped.

## 3. Screenshots 02 and 04 (both sizes)

01, 03 and 05 are acceptable. Redo:
- 02: Winter Warm-Up, Groups tab, groups with player names and tee times visible (not the Details form).
- 04: the live event (Spring Charity Classic) Live tab with the leaderboard showing positions and points; or the player scoring screen from /p/ mid-round if the script can be fixed quickly. Not the "Barry Wilson, confirm your details" screen, which is still in place from the first batch.
Same sizes, same rules as 016 (wait for content, check the bottom, no loading state). Overwrite and commit.

## 4. Prove and tag

Push, confirm the production deploy, run the default suite (which must now send no emails) and the explicit OTP test once (after Karla confirms the limit is raised). Paste the tails. Tag `ios-rc5` when green.

Report to docs/console-outbox/018-rate-limit-seed-shots.md with the email count before and after, the seed diff, and what 02 and 04 now show. Commit, push, wait-inbox.
