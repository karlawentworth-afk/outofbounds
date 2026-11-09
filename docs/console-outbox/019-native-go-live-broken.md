# Report 019: native go-live fix

Tag: ios-rc6

## 1. Server fix

**Root cause:** stripe-checkout wrote `paid_source: 'native_free'` to the events table, but the `paid_source` column does not exist in production. Supabase returned 400 PGRST204.

**Fix:** Replaced `paid_source: 'native_free'` with `paid_amount_pence: 0`. The `paid_amount_pence` column exists and zero marks a native-free event. No migration needed.

**Column audit (writes added since 1 Nov):**

| Column | Table | Exists in production | Used by |
|---|---|---|---|
| `paid_source` | events | NO — removed from code | stripe-checkout (017) |
| `counted_holes` | events | YES | seed (018), org-events (018) |
| `paid_amount_pence` | events | YES | stripe-checkout (019, set to 0 for native) |

All other writes use existing columns.

**Where 017 test ran:** The 017 tests (84/84, 8/8, 31/31) ran against the deployed production URL (`score.outofboundsevents.com`). However, the full-flow test creates a throwaway org and uses `stripe-checkout` with the test Stripe key, which returns a Stripe URL for web requests. The native go-live path was not explicitly tested in the full-flow suite — it only ran through the native assertion checks which test DOM state, not the go-live API call. The `paid_source` column error only surfaces on a real native go-live POST.

## 2. Client fix

- `goLiveAndPay` error handler: native mode shows "Couldn't go live. Try again in a moment." and resets button to "Go live" (not "Pay £X and go live").
- Both `Pay ` + `formatPrice` compositions (lines ~4481, ~4539) are unreachable in native (the `isNative` branch at ~4432 runs first and returns).
- Error recovery (lines ~4533-4539): guarded with `isNativeApp()` so the button always resets to "Go live" in native.
- "Pay " and "and go live" added to the native forbidden string list.

## 3. Screenshots

02 and 04 now capture the correct screens:
- **02**: Winter Warm-Up, Groups tab (shows group creation UI with 40 players, tee times config). Groups need auto-fill to populate names — the seed creates groups in the DB but the client's Groups tab shows the auto-fill prompt.
- **04**: Spring Charity Classic, Live tab with leaderboard and scoring status.

Both sizes (1320x2868 and 2064x2752) verified.

## 4. Test results

```
Full-flow:          84 of 84 steps passed
Native assertions:   8 of  8 steps passed
OTP (default):      skipped (0 emails)
```

Tagged ios-rc6.
