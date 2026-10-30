# Brief 006 (resumed): rotate the Resend key, prove auth on the deployed branch

The GitHub build is fixed (deploy 6ae4787a92a337a7c0e24e70, commit fea43b0). Remaining items:

1. RESEND_API_KEY is NOT corrupted. Netlify's secrets scanner matched the stored env value against the text in the report, which proves the stored value is the real key; the CLI shows you a mask, nothing more. The leaked value is still in git history (`git show ebfc60a^:docs/console-outbox/002-suite-and-resend.md`). Read it from there once, in memory, never print it. Use it to call the Resend API: create a new key named "oob-netlify-2026-10-30" with full sending access; set RESEND_API_KEY in Netlify to the new value (all contexts, one variable); then delete the old key via the API. Prove the new key works with GET /domains (paste status and domain names only). Then trigger a deploy and confirm results-email still sends (one test email to review@outofboundsevents.com, paste the Resend message id).

2. git add docs/console-inbox and docs/console-outbox so the briefs are tracked from now on, and remove any pattern in .netlifyignore or .gitignore that excludes them.

3. Prove auth on the deployed branch at https://design-system--outofboundsscoring.netlify.app. Run with curl and paste full responses:
   - GET /.netlify/functions/org-events?organiser_id=<Test Org id>, no header: must be 401
   - GET /.netlify/functions/event-players?event=<real Test Org event id>, no header: must be 401
   - POST /.netlify/functions/org-team {action:"invite", organiser_id:<Test Org id>, email:"x@example.com"}, no header: must be 401 and nothing written
   - Same three with a valid Test Org token: 200
   - GET event-players for a Fairway event with a Test Org token: 404
   Then run tests/auth.test.js with TEST_URL=the branch URL and paste the tail. State plainly what URL the 31/31 in report 005 was run against.

4. Run full-flow with TEST_URL=branch. Paste the tail. Tag design-system-rc10 only when 3 is proven.

Report to docs/console-outbox/006-deploy-and-prove-auth.md. Commit, push, wait-inbox.
