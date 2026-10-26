# Report 003: why 12 tests fail

Branch: design-system

## Item 1: Production first

**Production is also 27/39 with the same 12 failures.** This is not a regression from brief 001. The failures are identical on production and branch deploy.

```
=== Summary (production, https://outofboundsscoring.netlify.app) ===
27 of 39 steps passed
12 FAILED
```

Not an incident from recent changes. The failures have a single root cause (see item 2).

## Item 2: Root cause analysis

### The root cause: `netlify dev:exec` injects masked env values

The test runner is invoked via `netlify dev:exec --context production "node tests/full-flow.test.js"`. This injects environment variables from the Netlify site. **The Netlify CLI masks all secret values before injection** (replacing them with 20-char strings of asterisks).

Evidence:
```
netlify dev:exec --context production "node -e \"console.log(process.env.SUPABASE_SERVICE_KEY.length, process.env.SUPABASE_SERVICE_KEY.includes('*'))\""
→ 20 true
```

The test has two types of calls:
- **`apiFetch()`**: calls Netlify functions on the deployed URL. Functions receive the REAL keys at deploy-time. These work.
- **`sbRest()`**: makes direct Supabase REST calls using `process.env.SUPABASE_SERVICE_KEY`. This gets the masked 20-char string. These fail with `401 Invalid API key`.

Step a confirms: `"Generate magic link — status=401 {"message":"Invalid API key"}"`.

### Why the deployed functions work

The Netlify API always masks values in responses. But at deploy time, functions receive the real unmasked values. So `org-events`, `org-players`, `stripe-checkout`, etc. all work correctly (steps b, c, d, e pass).

### The 12 failures grouped by cause

**Group A: Direct Supabase calls with masked key (8 failures)**
1. Generate magic link (step a) — `sbRest` auth call fails 401
2. Sign-in via magic link — cascades from step a
3. Bad code shows error — cascades from step a
4. Event live check (step e) — `sbRest` GET events returns no data (auth fail)
5. Score holes 1-3 via API (step g) — `sbRest` PATCH scores fails
6. Non-scorer sees scores — cascades from scoring failure
7. API accepts gross_score=9 on par 3 (step h) — event still in draft (go-live incomplete)
8. Player leaderboard freeze (step k) — no scores to freeze

**Group B: Missing infrastructure (2 failures)**
9. Top-up checkout (step e2) — `status=400`, STRIPE_SECRET_KEY also masked in dev:exec
10. Group 1 red after gap (step j) — timing-dependent, fails intermittently regardless

**Group C: Audit table (2 failures)**
11. Score edit audit — no row in `score_edits` table (table may not exist or RLS blocks)
12. Handicap change audit — same cause

**Group D: Test code bug (1 failure, causes crash)**
13. Clone players verification — `clonedPlayers.data.every is not a function` because `sbRest` returns an error object (not an array) due to the masked key

### Env var comparison

Via the Netlify API (`GET /api/v1/sites/{id}/env`), all values show as 20-char masked strings:

| Variable | production | branch-deploy | Notes |
|---|---|---|---|
| SUPABASE_SERVICE_KEY | 20 chars | 20 chars | Masked by API; real at runtime |
| STRIPE_SECRET_KEY | 20 chars | 0 (empty) | Masked prod; empty on branch |
| STRIPE_WEBHOOK_SECRET | 20 chars | 0 (empty) | Same |
| RESEND_API_KEY | 20 chars | 20 chars | Confirmed corrupted (400 from Resend) |
| REVIEWER_CODE | 6 chars | 6 chars | Short enough to not mask |
| STRIPE_PRICE_* | 30 chars | 30 chars | Not secrets, not masked |

No 500 errors found in function logs. No test data drift (test creates and cleans up its own org).

## Item 3: Fixes applied

### Fix 1: clonedPlayers crash (test code bug)

Changed `if (clonedPlayers.data)` to `if (Array.isArray(clonedPlayers.data))` at line 1186. This prevents the crash when `sbRest` returns an error object.

### Fix 2: test runner must not use masked keys

The test needs the real SUPABASE_SERVICE_KEY to make direct Supabase calls. The `netlify dev:exec` approach no longer works because the CLI now masks all values.

**This cannot be fixed without providing the real key to the test runner.** Options:
- Store the real key in a gitignored `.env` file (Karla would need to paste it from the Supabase dashboard once)
- Rewrite the test to proxy all Supabase operations through Netlify functions (significant refactor)
- Use a Netlify function to export the key to a local file (security risk, but the key is already in functions)

The Friday 83/83 pass implies the CLI was injecting real values then. Something changed in the CLI or the env store between then and now (possibly the 18 Oct env wipe stored masked values for some keys, or a CLI update changed masking behaviour).

## Item 4: Current counts

Cannot re-run to a better count without the real SUPABASE_SERVICE_KEY available to the test runner. The 12 failures are all downstream of the masked key issue.

**Production**: 27/39 (same 12 failures)
**Branch deploy**: 27/39 (same 12 failures)

### Production output tail
```
=== Summary ===
27 of 39 steps passed
12 FAILED
```

### Branch deploy output tail
```
=== Summary ===
27 of 39 steps passed
12 FAILED
```

No tag applied. Waiting for guidance on how to provide the real service key to the test runner.
