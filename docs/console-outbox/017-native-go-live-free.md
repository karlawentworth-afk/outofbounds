# Report 017: native go-live is free

Tag: ios-rc4

## 1. Native go-live

**Marker:** api.js sends `X-OOB-Native: 1` request header on every API call when `isNativeApp()` returns true. The header is set from the client, not derivable from `?native=1` alone (the server checks `event.headers['x-oob-native']`).

**stripe-checkout changes:**
- When `X-OOB-Native: 1` is present and the request is not a top-up: sets event live+paid with `paid_source: 'native_free'`, generates player tokens, returns `{ free: true }`. No Stripe session created.
- Native top-ups: returns `{ free: true, top_up: true }`. No charge.
- Web requests without the header: unchanged (fee rows, Stripe checkout URL).

**Client (native mode):**
- Go-live tab shows "N players ready" and a "Go live" button. No fee rows, no Pro card, no native block message.
- `#golive-native-block` removed entirely from DOM by app-shell.js.
- Top-up toast: "Player added" only (no 99p mention, already guarded in brief 012).

**Web unchanged:** per_event organisers on the web still see fee rows and get a Stripe checkout URL.

## 2. 016 addendum

- `#golive-pro-note` never renders in native (element removed from DOM by app-shell.js boot).
- Go-live code uses `isNativeApp()` (not `Capacitor.isNativePlatform()` alone) so `?native=1` exercises the same branch.
- "website" added to native forbidden string list.

## 3. Test results (all against production)

```
Full-flow:          84 of 84 steps passed
Native assertions:   8 of  8 steps passed
Auth:               31 of 31 steps passed
```

Tagged `ios-rc4`.
