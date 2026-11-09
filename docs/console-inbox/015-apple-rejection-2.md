# Brief 015: second Apple rejection (9 Nov), three issues

Apple rejected 1.0 (8) again on 9 Nov after reviewing on iPhone 17 Pro Max and iPad Air 11-inch (M3), iOS/iPadOS 27.2. Three points. Fix all three before anything else. Do NOT resubmit; Claude replies to Apple and resubmits by hand once the report is in. The resubmission goes straight back into the expedited queue (Apple confirmed on 4 Nov), so speed matters: first competition is 15 Nov.

## 1. Guideline 4.0 Design: events screen cropped at the bottom

Apple's words: "the screen on the 'events' page appears to be cropped at the bottom, preventing the full content from being displayed" on both devices.

Reproduce in Playwright with `?native=1` on production at these CSS viewports, deviceScaleFactor 3 and 2, mobile/touch on, and `viewport-fit=cover` honoured:
- iPhone 17 Pro Max: 440 x 956 (safe-area-inset-bottom 34px, top 59px)
- iPad Air 11-inch: 820 x 1180

Expected cause: a `height:100vh` or fixed-height container with `overflow:hidden` on the organiser events/dashboard list, so the last card and anything under it sit beneath the home indicator or off the bottom. Fix it properly, not by shrinking content:
- Use `100dvh` (fallback `100vh`) for full-height shells and let the list scroll.
- Pad the bottom of every scrolling list and any bottom bar with `env(safe-area-inset-bottom)`.
- Check every organiser screen, not just events: dashboard, events list, event detail, groups, scoring, finished, settings, sign-in. Also the player screens in /p/.
- Take full-page and viewport screenshots at both sizes and look at the bottom of each one yourself. The last element on every screen must be fully visible with the page scrolled to the end.

Add a test: at both viewports, for each organiser screen, assert the last visible content element's bottom edge is inside the viewport after scrolling to the end, and that nothing is clipped by a parent with overflow hidden.

## 2. Guideline 3.1.1 again: the reviewer saw a paid tier ("PLAN")

Apple's words: "The app accesses digital content purchased outside the app, such as PLAN, but that content isn't available to purchase using In-App Purchase."

Brief 012 removed prices, Upgrade and billing. What is still in the native DOM is the tier itself. Found in public/o/index.html:
- Settings rows: `Branding <span class="pro-label">Pro</span>` and `Team <span class="pro-label">Pro</span>` (line ~2815), plus the toasts "Branding is a Pro feature" / "Team is a Pro feature".
- Live/finished screen: `paidEl.textContent = 'Included with Pro'` and `'Paid £x on date'` (line ~4549).
- Any other "Pro", "Play", "Play pass", "plan", "paid", "included with", "upgrade", "free trial", "comp" wording reachable in native mode, including the add-players sheet (line ~3687) and the go-live review (line ~4387).

Rule for native mode (isNativeApp() true): the app must never name, show or hint at a tier, a plan, a payment or a feature being paid for. Concretely:
- No "Pro" or "Play" labels anywhere. Remove the pro-label spans in native.
- Gated features: if the organiser has them, show them with no label. If they do not, do not show the row at all in native (no toast, no dimmed row). Same for the add-players Upload/People options.
- `live-paid-info` is hidden in native regardless of plan.
- Superadmin Admin screen: hide it in native too (it shows plans and comps). Karla uses the web for admin.
- Error strings from functions that mention plans (e.g. "Play plan is limited to 40 people. Upgrade to Pro for unlimited.") must be rendered in native as a neutral message ("This event has reached its player limit.") without the plan wording. Map them client-side; do not change the API.

Extend the native DOM assertions: with the reviewer account AND with a fresh per_event organiser, across every screen, the following strings must not appear in visible text or title/aria attributes: "Pro", "Play plan", "Play pass", "plan", "Plan", "PLAN", "upgrade", "Upgrade", "billing", "Billing", "£", "paid", "Paid", "included with", "trial", "subscription". Exclude the word "plan" only where it is part of ordinary copy that is not about tiers, and list every exclusion in the report with the sentence it sits in.

## 3. Guideline 2.3.3: screenshots show the old app

Apple's words: "The iPhone and iPad screenshots do not show the current version of the app in use."

Produce new screenshots of the current design in native mode (`?native=1`, no test banner, no tier words, after items 1 and 2 are done and deployed). Use the reviewer account's sample events so the screens have real-looking content.

Sizes (PNG, no alpha, exact pixels):
- iPhone 6.9-inch: 1320 x 2868 portrait (CSS viewport 440 x 956 at deviceScaleFactor 3).
- iPad 13-inch: 2064 x 2752 portrait (CSS viewport 1032 x 1376 at deviceScaleFactor 2).

Five per size, in this order, same screens on both:
1. Organiser dashboard with events listed
2. Event detail with groups and tee times
3. Live leaderboard during an event
4. Player scoring screen (from /p/)
5. Finished event with results

No marketing frames, no text overlays, no device bezels. Just the app. Check the bottom of every screenshot for the cropping from item 1 before saving. Save to docs/store/ios/iphone-69/01.png to 05.png and docs/store/ios/ipad-13/01.png to 05.png and commit them (they are small; use `git add -f` if the folder is ignored). Claude uploads them in App Store Connect Media Manager.

## 4. Deploy and prove

Push to master, confirm the production deploy succeeded (check the Netlify deploy state, not just the push), then re-run: full-flow suite, journeys, auth, the OTP end-to-end test, the native DOM assertions from item 2 and the cropping test from item 1, all against production. Paste the tails. Tag `ios-rc2` only when everything passes.

Report to docs/console-outbox/015-apple-rejection-2.md with: the root cause of the cropping and the fix, the full list of strings removed or hidden in native with line references, the exclusions list, screenshot paths with pixel sizes verified by reading the PNG headers, and the test tails. Then commit, push, wait-inbox.
