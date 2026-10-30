# Brief 009: merge design-system to master (Karla has authorised this, 30 Oct)

Gates, all must be true before step 3; if any is false, stop and write the report saying which:
- Report 007 shows a full-flow run on the branch that ran to the end with 0 failures (timing flakes allowed only if re-run passed).
- Journey tests 15/15 on the branch.
- Report 008 shows the sign-in code arrived at the outside address and the results email got a Resend message id.
- Merge dry run in 007 reported no conflicts.

1. Production before-number: run full-flow with TEST_URL=https://score.outofboundsevents.com and record the summary line.
2. Tag the current master as prod-2026-10-31-pre-design (rollback point). Push the tag.
3. Merge: on master, `git merge --no-ff design-system -m "Merge design-system: new organiser and player design, auth on every organiser function, OTP sign-in, journey tests"`. Push master. Watch the GitHub-triggered production deploy; paste deploy id, commit and state. It must succeed without a manual deploy.
4. Env vars production needs that the branch used (names only): confirm each exists in the production context. STRIPE_SECRET_KEY stays the TEST key for now; do not touch it.
5. Immediately after deploy: run full-flow and journeys with TEST_URL=https://score.outofboundsevents.com. Paste both summary lines. Then with curl against production, no header: org-events GET, event-players GET, org-team invite POST must all be 401.
6. Visual check on production: screenshots at 390x844 of sign-in, dashboard (Test Org), live screen (Fairway Autumn Invitational via reviewer route), player scoring hole 7. Save under docs/screens/production-2026-10-31/. Describe what is in each.
7. Flip STORE_LIVE to true on master ONLY for the Android badge if the flag supports per-store; otherwise leave STORE_LIVE false until Apple is released (brief 010 handles it).
8. If anything in 5 fails that passed in 1: revert with `git revert -m 1 <merge commit>`, push, confirm production deploy, re-run full-flow, and report. Do not try to fix forward on master.
9. Tag master prod-2026-10-31-design-live on success.

Report to docs/console-outbox/009-merge-to-production.md. Commit, push, wait-inbox.
