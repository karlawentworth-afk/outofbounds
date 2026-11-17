# Report 026: Ryan watcher setup

## Organiser

- **Name:** Elite Golf Events
- **ID:** 7d1a0521-0720-49cf-94bf-1f3263a7cabb
- **Created:** 2026-11-17 08:54 UTC
- **Note:** Contact email does not match the email in .ryan-email (business address vs personal). Only non-test org created since 16 Nov. Karla to confirm identity.

## What the watcher checks (every 10 minutes)

1. **Activity log** — new entries for this organiser since last poll: sign-ins, events created, players added, scores saved.
2. **Snag detection** on live events:
   - Live for more than 2 hours with no scores
   - Players with no group
   - Groups with no tee time
3. **Deduplication** — each snag type per event is flagged once, cleared if resolved.

## What it cannot check

- **Netlify function logs** — the CLI `netlify logs:function` streams live and does not support historical queries by organiser_id. 4xx/5xx errors from his requests would need Netlify log drains or a function-level error table. Not implemented.
- **Feedback submissions** — the Help button sends email via Resend only, not stored in the database. Cannot be polled.

## Commit cadence

- **Immediately** on any SNAG (5xx, failed go-live, OTP 429, or possible snag).
- **Hourly** otherwise, if there are new log lines.

## Script

`scripts/watch-ryan.js` — run with `node scripts/watch-ryan.js`. Needs SUPABASE_SERVICE_KEY in env or via Netlify CLI.

## Initial run

Two snags flagged on first run (likely setup-in-progress, not bugs):
- Event "Winter Series #1 - Cavendish GC" live for 3h with no scores
- 4 players with no group
