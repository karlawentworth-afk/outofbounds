# Brief 012: Apple rejection fixes (web side, no new binary)

Apple rejected 1.0 (8) on 29 Oct, reviewed on iPad Air 11-inch M3, iPadOS 27.2, against the OLD production site. Four findings. Full text is in App Store Connect; summary:
- 2.1(a): tapping Apple login inside the app showed an error.
- 2.1 Information Needed: entering review@outofboundsevents.com showed "check your inbox for a sign-in link" instead of a code field (old flow; the merged code flow fixes this, but prove it inside the native shell).
- 3.1.1 (twice): the app accesses paid subscriptions bought outside the app, and the sign-in email linked out to the website that sells them.

Decision (Karla via Claude): no in-app purchase. The native app becomes a pure "use" app with no purchase references and no links to the marketing site. Google and Apple sign-in are removed inside the native shell (email code only), so guideline 4.8 does not apply. The web keeps everything.

Work on master directly (small, well-tested), tag prod-2026-11-01-apple-fixes:

1. Native detection. One helper `isNativeApp()` in public/shared/app-shell.js: true when window.Capacitor?.isNativePlatform() is true, or the user agent contains the shell's marker if we set one. Add a query flag `?native=1` that forces it, for testing in Playwright.

2. When native:
   - Sign-in screen shows only "Continue with email" and the code field. No Google, no Apple, no "or" divider.
   - No prices, plan names with prices, "Upgrade", "Buy", "Play pass", "Pro", billing portal, Stripe checkout buttons, or any link to outofboundsevents.com (marketing), pricing, or the billing portal anywhere in /o/, /p/, settings, dashboard, event screens, finished screen or share text. The player-side message for an event that needs a pass becomes: "This event isn't active yet. Ask your organiser." The organiser-side message becomes: "This event isn't active yet. Manage your account on the web." with no link.
   - Footer/about text: no marketing URL. "Scored with Out of Bounds" stays, as plain text.
   - Grep public/ for outofboundsevents.com, "£", "price", "Upgrade", "Pro plan", "pass" and decide each occurrence: hidden when native, or neutral wording. List every occurrence and its treatment in the report.
   - The web (non-native) is unchanged.

3. Reviewer path inside the native shell. With ?native=1 in Playwright at 820x1180 (iPad) and 390x844: tap Continue with email, enter review@outofboundsevents.com, assert the 6-digit code field appears, enter 479649, assert the dashboard loads with the Fairway events. Screenshots: native-signin-ipad.png, native-code-ipad.png, native-dashboard-ipad.png, same three at 390. Also run the same flow on a REAL iPad or iPhone build if Karla's devices are available via TestFlight build 8; otherwise state clearly that only the web view path was tested.

4. Update the App Review Information notes via the ASC API (after brief 011 has the key working), replacing the sign-in instructions with: "1. Tap Continue with email. 2. Enter review@outofboundsevents.com. 3. A 6-digit code field appears below the email. Enter 479649. 4. The organiser dashboard loads with sample events. The app does not sell anything; organisers manage their account on the web, and nothing in the app links there."

5. Tests: add native-mode assertions to the suite (sign-in shows one button when ?native=1; no occurrence of "outofboundsevents.com", "£" or "Upgrade" in the rendered DOM of dashboard, event, player and finished screens when native). Run full-flow and journeys against production. Paste tails.

6. Do NOT resubmit to Apple yet. Write the report with the occurrence list, screenshots, and test tails. Claude will draft the reply to App Review and Karla says send.

Report to docs/console-outbox/012-apple-rejection-fixes.md. Commit, push, wait-inbox.
