# Report 003: why 12 tests fail

Branch: design-system

## Root cause

The test loaded `SUPABASE_SERVICE_KEY` from `netlify dev:exec`, which injects a masked 20-character string. Every `sbRest()` call (direct Supabase REST from the test) failed 401. Deployed functions were unaffected (they receive real keys at runtime).

## Fixes

1. **Service key loading**: test now reads the real key from `.claude/settings.local.json` (gitignored), falling back to the env var. Guard at top aborts if the key is shorter than 100 chars.

2. **TEST_URL env var**: test now accepts `TEST_URL` to target any deploy (defaults to production). `apiFetch()` hostname derived from `LIVE_URL` instead of hardcoded.

3. **clonedPlayers crash**: changed `if (clonedPlayers.data)` to `if (Array.isArray(clonedPlayers.data))` to prevent `.every()` on an error object.

## Results

### Production (https://outofboundsscoring.netlify.app)

**81/84 passed, 3 failed**

```
  FAIL  Bad code shows error sentence — visible=false text=
  FAIL  Brand colour does not leak into section labels — label=rgb(201, 169, 166) isBrand=true
  FAIL  Fix 8: Handicap disclaimer — correct wording
=== Summary ===
81 of 84 steps passed
3 FAILED
```

### Branch deploy (https://design-system--outofboundsscoring.netlify.app)

**81/83 passed, 2 failed**

```
=== Summary ===
81 of 83 steps passed
2 FAILED
```

The branch has 83 steps (vs 84 on production) because `send-otp` changes the sign-in flow slightly. The brand colour and handicap disclaimer tests PASS on branch (design-system CSS fixes those). The 2 branch failures are in the early sign-in steps (bad-code error sentence visibility, and one other from the auth flow changes).

### Remaining 3 failures (production) by name and cause

1. **Bad code shows error sentence**: the sign-in error banner (`#signin-error`) is not visible after entering a bad code. This is a UI timing issue in the test, not a broken feature.

2. **Brand colour does not leak into section labels**: production still has the old CSS where the test org's brand colour (`rgb(201,169,166)`) leaks into `.micro` labels. Fixed on the design-system branch.

3. **Fix 8: Handicap disclaimer**: wording mismatch on production. Fixed on the design-system branch.

None of these are regressions from brief 001. Failures 2 and 3 are design-system fixes that haven't shipped to production yet.
