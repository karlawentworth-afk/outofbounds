# Brief 012b: hide the Stripe test-mode banner in native mode (do before 013)

Checked on production with ?native=1 at 820x1180 on 31 Oct: the sign-in, code field and reviewer dashboard are right, no prices or upgrade wording in the DOM. But the yellow banner "Test mode. Cards aren't charged." still renders at the top of every organiser screen in native mode. To an App Review reader that says the app takes card payments.

1. Never render the test-mode banner when isNativeApp() is true. Also, on the web, show it only to superadmin users (Karla), not to every organiser; ordinary organisers never need to know which Stripe mode is on.
2. Add the banner text to the native-mode DOM assertions ("Test mode" must not appear).
3. Push, confirm the production deploy, and re-check with ?native=1 at 820x1180: dashboard, settings, an event screen, the finished screen. Paste the DOM scan results (counts for "£", "Upgrade", "Test mode", "outofboundsevents.com" excluding mailto addresses and the reviewer email in script).

Report to docs/console-outbox/012b-hide-test-banner.md. Commit, push. Then 013 remains gated on apple-reply-posted.md; keep polling for it.
