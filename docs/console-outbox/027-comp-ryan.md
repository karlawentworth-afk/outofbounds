# Report 027: Comp Ryan's organisation

## Organiser

- **Name:** Elite Golf Events
- **ID:** 7d1a0521-0720-49cf-94bf-1f3263a7cabb
- **plan:** pro
- **plan_source:** comp
- **comp_until:** 2099-12-31T23:59:59Z
- **Activity_log:** "comp by Karla, permanent" written at 2026-11-17 12:48 UTC

## Email note

Ryan's email in .ryan-email does not match the contact_email on this org (a business address). This is the only non-test organiser created since 16 Nov. He created "Winter Series #1 - Cavendish GC" and added 4 players today. Karla to confirm this is him.

## Org was already comped

The org already had plan=pro, plan_source=comp, comp_until=2099 when found. Possibly set during signup or by another session. The activity_log entry has been written regardless.

## Gate audit — no price surfaces for a comp Pro org

| Gate | File:line | What it checks | Result for this org |
|------|-----------|----------------|---------------------|
| Go-live fee box | public/o/index.html:4451-4458 | `org.plan === 'pro'` hides fee, shows "Included with Pro" | CLEAR — no fee shown |
| "Pay £X.XX" button text | public/o/index.html:4466-4481 | Play path only when not Pro | CLEAR — button says "Go live" |
| stripe-checkout free bypass | netlify/functions/stripe-checkout.js:137-162 | `planGate.isPro()` returns `{ free: true }` | CLEAR — no Stripe session created |
| Billing screen | public/o/index.html:2028-2036 | `plan_source === 'comp'` shows "Pro, courtesy of Out of Bounds" | CLEAR — no price, no upgrade panel |
| 40-player limit | netlify/functions/org-people.js:69-77 | `isPro` skips the 40 cap | CLEAR — unlimited people |
| Top-up on add player to live event | netlify/functions/org-players.js:422-425 | Play org only gets `top_up_required` | CLEAR — Pro skips |
| plan-gate.js shared check | netlify/functions/shared/plan-gate.js:24 | `org.plan === 'pro'` returns true | CLEAR — passes immediately |
| Branding save | netlify/functions/org-branding.js:85 | `assertPro()` | CLEAR — passes |
| CSV export | public/o/index.html:2878-2888 | `isPro` enables button | CLEAR — enabled |
| Upload spreadsheet | netlify/functions/org-player-upload.js:114 | `assertPro()` | CLEAR — passes |
| Series | netlify/functions/org-series.js:33,117 | `assertPro()` | CLEAR — passes |

All gates pass. Nothing asks for a card or shows a price for a comp Pro org.
