# Brief 008: verify email now works (do this before continuing 007 if 007 is not finished)

Karla has set a new Resend key as RESEND_API_KEY in Netlify and as the Supabase custom SMTP password.

1. Trigger a redeploy of the branch (empty commit) so functions pick up the new key. Confirm the deploy is ready.
2. Resend API check: GET https://api.resend.com/domains with the key as a deployed function sees it (use `netlify dev:exec --context production` only if it injects the real value; otherwise call through a one-off invocation of an existing function that already sends, e.g. results-email in dry-run mode if it has one). Paste HTTP status and domain names only. Never print the key.
3. Sign-in code to an outside address: POST send-otp on the branch for oob-test-nonmember@mailinator.com. Paste the HTTP status and body. Then open https://www.mailinator.com/v4/public/inboxes.jsp?to=oob-test-nonmember in Playwright and confirm an email arrived with subject starting "Your Out of Bounds sign-in code is". Paste the subject line and the first line of the body. If nothing arrives in 3 minutes, say so and paste the Supabase auth log entry if reachable; do not retry more than twice.
4. Results email: send one real results email for the Fairway Autumn Invitational to review@outofboundsevents.com through the branch. Paste the Resend message id from the function's response.
5. Update the SMTP canary test from brief 002 so it now expects success.

Report to docs/console-outbox/008-verify-email.md. Commit, push, then continue or resume 007.
