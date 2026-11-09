# Brief 017: native go-live is free (Karla's decision, 9 Nov), plus the 016 addendum if not already done

Karla has decided: organisers using the iPhone app can go live without paying, for now, until In-App Purchase exists. The web keeps the Play price. Do this after 016 finishes, in the same push if possible.

## 1. Native go-live is free

- The app shell sends a marker that only the native app can set: a request header `X-OOB-Native: 1` added by the Capacitor shell to every API call (not derived from `?native=1`, which the web can fake). If the shell cannot set headers, use a body flag set only when `Capacitor.isNativePlatform()` is true, and say so in the report.
- stripe-checkout: when the marker is present and the organiser is not Pro, treat the request like Pro: set the event live and paid (`paid_source: 'native_free'` or equivalent so we can see it in the data later), generate player tokens, return `{ free: true }`. Never create a Stripe session for a native request.
- Top-ups for players added to a live event from native: allowed, no charge, no toast about money (confirm line ~3785 path says "Player added" only).
- Client, native mode: the Go live tab shows the same thing for every organiser: "N players ready" and a "Go live" button. Remove `#golive-native-block` ("Manage your account on the web") from the native DOM entirely. No fee rows, no Pro card, no "Included with Pro".
- Web behaviour is unchanged. Prove it: a per_event organiser on the web still gets the fee rows and a Stripe checkout URL (test mode).
- Add tests: (a) native request from a per_event organiser goes live free; (b) same request without the marker returns a checkout URL; (c) a web request with `?native=1` but no marker still returns a checkout URL.

## 2. From the 016 addendum, if 016 did not already cover them

- `#golive-pro-note` must never say "Included with Pro" in native; prove on a READY event with the reviewer account.
- Go-live code uses `isNativeApp()` for the native decision, not `Capacitor.isNativePlatform()` alone, so `?native=1` exercises the same branch the app runs.
- "Open big screen", "Print a QR poster" and the share links opened from the native app: each must have a way back to the organiser screen, and the /r page promo must be suppressed when opened from the app.
- Forbidden-string list includes "charge", "No extra charge", "web", "website" for native screens (the word "web" only where it steers the user to the website; list exclusions).

## 3. Prove and tag

Push, confirm the production deploy, run the full set (full-flow, journeys, auth, OTP, native assertions, cropping, dashboard-loads-within-2s, and the three new go-live tests) against production. Paste the tails. Tag `ios-rc3` (or `ios-rc4` if rc3 was used by 016) only when everything passes. If the screenshots from 016 were taken before this change, re-check that none of them shows the Go live tab with old wording; reshoot that one if so.

Report to docs/console-outbox/017-native-go-live-free.md. Commit, push, wait-inbox.
