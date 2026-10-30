# Report 006: deploy fix, secrets redaction, auth proof

Branch: design-system
Tag: design-system-rc10

## 1. Deploy fix

The GitHub-triggered build was failing because Netlify's secrets scanner
matched the RESEND_API_KEY env var value against text committed in
`docs/console-outbox/002-suite-and-resend.md` (key suffix and masked
string). Redacting those values fixed the build. A `.netlifyignore` was
also added to exclude docs/, tests/, ios/, android/ from the function
bundle.

**Deploy:** id=6ae4787a92a337a7c0e24e70, commit=fea43b0, state=ready.

## 2. Secrets redaction

Grepped the full repo for secret patterns (`re_`, `sk_test_`, `sk_live_`,
`whsec_`, `sk-ant-`, `sbp_`, `eyJhbGci`, asterisk-suffix combos).

Redacted:
- `002-suite-and-resend.md` line 61: key suffix in JSON
- `002-suite-and-resend.md` line 68: masked key string and production suffix
- `005-auth-blockers.md` line 83: truncated Stripe key

No other secret values found in docs/, tests/ or anywhere else in tracked files.
(Supabase anon key in public HTML is intentionally public, per CLAUDE.md.)

Added no-secrets-in-reports rule to CLAUDE.md.

## 3. RESEND_API_KEY rotation

Blocked. Both Netlify contexts (production, branch-deploy) store the
corrupted masked placeholder from the 18 Oct env wipe, not a real key.
The Netlify CLI and API mask values on display, so the actual stored
value cannot be read programmatically. Karla will create a new key at
resend.com/api-keys and set it in Netlify.

## 4. Auth proof on deployed branch

URL: https://design-system--outofboundsscoring.netlify.app

### Curl proofs

Test org: Curl Proof Org (778ba3b5, cleaned up after).
Test event: b53dae17. Fairway event: c20886e1.

**No header (all 401):**

```
GET  org-events?organiser_id=778ba3b5...        => {"error":"Missing or invalid Authorization header"}
GET  event-players?event=b53dae17...            => {"error":"Missing or invalid Authorization header"}
POST org-team {action:invite, organiser_id:...} => {"error":"Missing or invalid Authorization header"}
```

**Valid token (all 200):**

```
GET  org-events?organiser_id=778ba3b5...        => 200 {"events":[{...Curl Proof Event...}]}
GET  event-players?event=b53dae17...            => 200 {"players":[]}
POST org-team {action:invite, ...}              => 200 {"member":{...helper invite created...}}
```

**Cross-org (Fairway event with Curl Proof Org token):**

```
GET  event-players?event=c20886e1...            => 403 {"error":"Not a member of this organisation"}
```

The brief expected 404 but `requireEventOwner` returns 403 via
`requireOrgMember` when the event exists but the caller is not a member.
Report 005 notes the same: 404 only when the event itself does not exist.

### Auth test suite: 31/31

```
URL: https://design-system--outofboundsscoring.netlify.app

  PASS  User A created + signed in
  PASS  User B created + signed in
  PASS  Org A created
  PASS  Org B created
  PASS  Event A created
  PASS  Player A created
  PASS  event-players: no token => 401
  PASS  event-players: wrong org => 404 -- got 403
  PASS  event-players: correct token => 200
  PASS  org-players GET: no token => 401
  PASS  org-players GET: wrong org => 404 -- got 403
  PASS  org-players GET: correct token => 200
  PASS  org-players POST: no token => 401
  PASS  org-players POST: wrong org => 404 -- got 403
  PASS  org-players POST: correct token => 200
  PASS  org-admin: no token => 401
  PASS  org-admin: non-superadmin => 403
  PASS  org-team GET: no token => 401
  PASS  org-team GET: wrong org => 403
  PASS  org-team GET: correct token => 200
  PASS  org-score-edit: no token => 401
  PASS  org-score-edit: wrong org => 404 -- got 403
  PASS  org-score-edit: correct token => 200
  PASS  stripe-portal: no token => 401
  PASS  stripe-portal: wrong org => 403
  PASS  stripe-portal: correct token => past auth
  PASS  stripe-checkout: no token => 401
  PASS  stripe-checkout: wrong org => 403/404 -- got 403
  PASS  stripe-checkout: correct token => past auth
  PASS  org-invite-send: no token => 401
  PASS  org-invite-send: wrong org => 403

=== Auth Tests: 31 passed, 0 failed, 31 total ===
```

The 31/31 in report 005 was run against a CLI deploy URL
(`https://6ae2138b7a122d296ba317b1--outofboundsscoring.netlify.app`),
not the branch subdomain. This run is against the branch subdomain
(`design-system--outofboundsscoring.netlify.app`) served by the
GitHub-triggered deploy.

## 5. Full-flow test: 49/49

```
URL: https://design-system--outofboundsscoring.netlify.app

  PASS  Sign-in: org-auth check
  PASS  No session: exactly one screen visible (sign-in)
  PASS  No session: no top bar visible
  PASS  Sign-in buttons: white, hairline, icon
  PASS  After sign-in: one screen visible
  PASS  Sign out: back to sign-in, one screen
  PASS  Bad code shows error sentence
  PASS  Create event
  PASS  Add 4 typed players
  PASS  Paste 4 players
  PASS  8 players with PH
  PASS  Auto-fill groups
  PASS  Initial group sizes
  PASS  Move player (3+5)
  PASS  Score-save before payment blocked
  PASS  Stripe checkout URL
  PASS  Go live tokens generated
  PASS  Event is live+paid
  PASS  Nominate scorer
  PASS  Scorer phone loads player view
  PASS  Score holes 1-3 via API
  PASS  Non-scorer sees scores
  PASS  Handover scoring
  PASS  API accepts gross_score=9 on par 3
  PASS  Bottom sheet exists and toggles
  PASS  Leaderboard returns entries
  PASS  Finish action response
  PASS  Player leaderboard freeze
  PASS  Organiser leaderboard full
  PASS  Player leaderboard has entries
  PASS  Top-up returns URL
  PASS  Top-up payment is 99p
  PASS  Group status initial
  PASS  Group 1 amber after stale
  PASS  Group 1 red after gap
  PASS  Score edit accepted
  PASS  Score edit audit row
  PASS  Handicap change without reason blocked
  PASS  Handicap change with reason accepted
  PASS  Handicap change audit (hole_number=0)
  PASS  Clone event
  PASS  Clone preserves settings
  PASS  Clone: players have fresh tokens, no groups
  PASS  Clone: no scores
  PASS  Offline: score buffered to localStorage
  PASS  Online: amber bar cleared after flush
  PASS  Re-auth with fresh token
  PASS  iPhone SE (375x667) fits
  PASS  iPhone 14 (390x844) fits

=== Summary ===
49 of 49 steps passed
```

Autofill 72 section hit a connection reset (ECONNRESET) before running;
all 49 scored steps passed.

Tagged design-system-rc10 at fea43b0.
