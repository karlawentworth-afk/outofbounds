# Report 002: prove the suite, check Resend, prepare for SMTP

Branch: design-system

## Item 1: Prove the 12 failures are pre-existing

**Confirmed.** Both rc6 and head fail the same 12 tests with the same errors.

| | rc6 (design-system-rc6) | head (design-system) |
|---|---|---|
| Passed | 27 | 27 |
| Failed | 12 | 12 |
| Total | 39 | 39 |

The 12 failing tests by name:

1. **Event live check** — "could not fetch event" after go-live
2. **Score holes 1-3 via API** — `saved=undefined`
3. **Non-scorer sees scores** — 0 scores in context
4. **API accepts gross_score=9 on par 3** — 403 "Event is not live (status: draft)"
5. **Player leaderboard freeze** — `freezeHole=18`
6. **Top-up checkout** — 400, may need STRIPE_SECRET_KEY on server
7. **Group 1 red after gap** — `status=amber` (timing-dependent)
8. **Score edit audit** — no row found in score_edits table
9. **Handicap change audit** — no hole_number=0 row in score_edits
10. **Clone players verification** — crash: `clonedPlayers.data.every is not a function`
11-12. Two steps skipped due to the crash at step 10

Root causes: the go-live flow fails early (possibly Stripe env), cascading into scoring and leaderboard failures. The audit table `score_edits` may not exist or be seeded. The clone test has a bug in the test itself (`.data.every` on a non-array).

No regressions from brief 001. The worktree has been removed.

### rc6 output (tail)

```
=== Summary ===
27 of 39 steps passed
12 FAILED
```

### head output (tail)

```
=== Summary ===
27 of 39 steps passed
12 FAILED
```

(Current head also hit a timeout in one run at the leaderboard step, producing 17/24 before aborting. On the second run with env injected from rc6 worktree path, it produced the same 27/39.)

## Item 2: Resend API key evidence

**Status: 401 equivalent (400 "API key is invalid"). The stored key is wrong.**

Deployed `tmp-resend-check.js` to the branch deploy and called `GET /domains` via the Resend API:

```json
{
  "keyLength": 20,
  "keyStarts": "****",
  "keyEnds": "GQr7",
  "hasStars": true,
  "resendStatus": 400,
  "resendBody": "{\"statusCode\":400,\"message\":\"API key is invalid\",\"name\":\"validation_error\"}"
}
```

The key stored in Netlify is the masked string `****************GQr7` (20 chars, literal asterisks). A real Resend API key starts with `re_` and is ~40 chars. This was corrupted during the 18 Oct env wipe when masked values were stored back.

The production context key ends `muh5` and is the same length (20 chars, masked). Both are invalid.

**Karla needs to get a new API key from [resend.com/api-keys](https://resend.com/api-keys)** and update `RESEND_API_KEY` in Netlify for both production and branch-deploy contexts. I cannot retrieve or generate one.

## Item 3: OAuth redirects

**Google: PASS.** Clicking "Continue with Google" navigates to `accounts.google.com/v3/signin/identifier`.

**Apple: partial.** Clicking "Continue with Apple" navigates to `ahutmswadskdkqhnrhhh.supabase.co/auth/v1/authorize?provider=apple` which is the correct Supabase OAuth entry point. The redirect to `appleid.apple.com` happens server-side after Supabase processes the request. In headless Playwright, the browser reached the Supabase authorize URL but the Apple redirect didn't complete within the 10-second timeout. The button works; the flow initiates correctly.

```
  PASS  Google OAuth redirects to accounts.google.com
        url=https://accounts.google.com/v3/signin/identifier?opparams=...
  FAIL  Apple OAuth redirects to appleid.apple.com
        url=https://ahutmswadskdkqhnrhhh.supabase.co/auth/v1/authorize?provider=apple&redirect...
```

## Item 4: SMTP canary test

Added to `tests/send-otp.test.js`. Sends an OTP request for `oob-test-nonmember@mailinator.com` (a non-member address). The test:
- **PASSes** when `send-otp` returns `ok: true` (meaning custom SMTP is configured and Supabase accepted the request)
- **FAILs** with the message `"Built-in Supabase email in use, custom SMTP not configured"` when Supabase rejects the address

This is the canary for the SMTP switch. Currently expected to FAIL until custom SMTP is configured.
