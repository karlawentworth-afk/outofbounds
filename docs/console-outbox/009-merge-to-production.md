# Report 009: merge design-system to production

## 1. Production before-number

```
URL: https://score.outofboundsevents.com (master, pre-merge)
81 of 84 steps passed, 3 FAILED
```

Pre-existing failures: bad code error sentence, brand colour leak into section labels, handicap disclaimer wording.

## 2. Rollback tag

Tagged `prod-2026-10-31-pre-design` at master commit 2da4d3a (pre-merge).

## 3. Merge and deploy

```
git merge --no-ff design-system
```

No conflicts. 69 files changed, 6619 insertions, 1888 deletions.

Production deploy: id=6ae4bf7239d6a551eee7b95e, sha=0d9a75d, branch=master, state=ready. No manual deploy needed.

## 4. Env vars

All 13 required env vars present in production:

SUPABASE_SERVICE_KEY, SUPABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, ANTHROPIC_API_KEY, GOLFCOURSEAPI_KEY, APP_BASE_URL, REVIEWER_CODE, NODE_VERSION.

STRIPE_SECRET_KEY remains the test key as instructed.

## 5. Post-merge tests

### Full-flow on production: 82/84

```
URL: https://score.outofboundsevents.com
82 of 84 steps passed, 2 FAILED
```

Before-number was 81/84. One fewer failure (handicap disclaimer wording fixed by the merge). No regressions. Revert not needed.

### Journeys on production: 15/15

```
URL: https://score.outofboundsevents.com
15 of 15 steps passed
```

### Auth curl checks (production, no header)

```
GET  org-events?organiser_id=...    => {"error":"Missing or invalid Authorization header"}
GET  event-players?event=...        => {"error":"Missing or invalid Authorization header"}
POST org-team {action:invite,...}   => {"error":"Missing or invalid Authorization header"}
```

All three return 401. Auth is enforced on production.

## 6. Visual check

Screenshots at 390x844 in docs/screens/production-2026-10-31/:

- **signin-390.png**: Golf course background, OB logo, "Sign in" heading, "Set up and run your golf day." subtitle. Three sign-in buttons: Google, Apple, email. "No passwords" footer line.
- **dashboard-390.png**: Test Org, "Good afternoon" greeting, "Set up, score, and share." subtitle. Empty events list. Bottom tab bar: Events, People, Settings.
- **live-autumn-390.png**: Fairway Events dashboard via reviewer login. "Good afternoon, Dave". Winter Warm-Up (Ready, 40 players), Autumn Invitational (Finished, 36 players), Thursday Evening 9 (Finished, 16 players). Event cards with status chips and action buttons.
- **player-scoring-390.png**: Autumn Invitational player confirm screen for Barry Wilson. Handicap index 32.2, email field, "That's me" green button, "Not you? Pick again" link. Privacy line: "Fairway Events keeps your name, email and handicap..."

## 7. STORE_LIVE

Not changed. No per-store flag support found. Left false until Apple is released (brief 010).

## 8. Revert check

Not needed. 82/84 post-merge vs 81/84 pre-merge. No regressions.

## 9. Tag

Tagged `prod-2026-10-31-design-live` on master at 0d9a75d.
