# Out of Bounds: native app brief (iOS and Android)

**For:** the console session on oob-scoring
**Goal:** Out of Bounds on the App Store and Google Play, built and signed in the cloud with no Mac, using Karla's existing Apple and Google developer accounts. The web app stays the product; the native app is a shell around it with the handful of things a browser can't do.
**Secrets rule applies throughout:** never ask Karla to paste a key, certificate, .p8 or keystore into chat. Everything lives in Codemagic's secrets or Netlify env vars. Tell her what to create and where to put it.

---

## 0. The two rules that get apps rejected

1. **No money inside the app.** No Pay button, no price, no "Upgrade to Pro", no link to the billing page. Play and Pro are bought on the website. Inside the app, the Go live review on Play shows "This event needs a Play pass. Get one at outofboundsevents.com" with no tappable link, and Settings says "Manage your plan at outofboundsevents.com". If the organiser already has credit or Pro, the app just works. (Apple guideline 3.1.1.)
2. **It must do things a website can't.** Push notifications, native sign-in, the camera, offline scoring, universal links, safe-area layout. These are not optional polish, they are what gets it past review. (Apple guideline 4.2.)

## 1. Architecture: remote-loaded, not bundled

- Capacitor 6+, `server.url` pointing at `https://score.outofboundsevents.com`. The app loads the live site inside a native WebView. Web fixes ship on every git push with no app release; app releases are only for native changes.
- Add `/.well-known/` to the repo for the two association files (section 5). Netlify serves them as static with the right content type.
- Detect "running in the app" with `Capacitor.isNativePlatform()` and expose `window.OOB.native = true` so pages can hide web-only bits (the install banner, any payment UI, the Help "Read the guide" link opens in-app).
- Safe areas: top bar and sticky Next button use `env(safe-area-inset-top/bottom)`. Test on a notched iPhone size in Playwright.
- Status bar: brand colour behind it, light text.

## 2. Sign-in inside the app (this is the gotcha)

Google blocks OAuth inside embedded WebViews, so "Sign in with Google" will fail in the app as it stands.

- Use `@capacitor/browser` to open the Supabase OAuth URL in the system browser sheet (ASWebAuthenticationSession on iOS, Custom Tabs on Android), with Supabase `skipBrowserRedirect: true`.
- Redirect back via universal link `https://score.outofboundsevents.com/auth/callback`, which the app intercepts, exchanges for a session, and sets the cookie as today.
- Sign in with Apple: use `@capacitor-community/apple-sign-in` for the native sheet on iOS; Apple expects it.
- Magic link emails open the app via the same universal link when the app is installed, otherwise the website. Both must land signed in.
- Add this to Supabase redirect allow list: `https://score.outofboundsevents.com/auth/callback`.
- Test all three sign-in routes on a real device via TestFlight before anything else; nothing else matters if sign-in fails.

## 3. Push notifications

- `@capacitor/push-notifications`. Firebase Cloud Messaging for both platforms (FCM routes to APNs for iOS).
- Karla creates: a Firebase project, the Android `google-services.json`, the iOS `GoogleService-Info.plist`, and an APNs key (.p8, "Apple Push Notifications service" type, created in the Apple Developer portal, uploaded to Firebase). Files go in the repo's `ios/App/App/` and `android/app/` as Firebase documents; the APNs key never goes anywhere but Firebase.
- Table `device_tokens (organiser_id, user_id, token, platform, created_at, last_seen)`. Registered on app open, removed on sign-out.
- Netlify function `push-send` using the FCM HTTP v1 API with a service account in Netlify env vars.
- Notifications, organiser only, each with a setting to turn off:
  - Group amber: "Group 4 hasn't saved a score for 45 minutes."
  - Hole skipped: "Group 6 skipped the 8th."
  - All in: "Every group has finished. Ready to publish results."
  - Helper invite accepted, feedback marked Done.
- Ask for permission at the right moment: the first time an event goes live, with a sheet explaining what they'll get. Never on first open.

## 4. Camera and photos

- Scorecard snap, logos and profile photo use `@capacitor/camera` when native (camera or library), falling back to the existing `<input type="file">` on the web.
- Resize on device before upload (max 1600px for scorecards, 512px for logos).

## 5. Universal links and app links

- `https://score.outofboundsevents.com/.well-known/apple-app-site-association` listing paths `/o/*`, `/p/*`, `/r/*`, `/auth/*`.
- `https://score.outofboundsevents.com/.well-known/assetlinks.json` with the Android signing cert SHA-256 (from the Codemagic keystore).
- iOS Associated Domains entitlement `applinks:score.outofboundsevents.com`. Android intent filters with `autoVerify`.
- A player link opens in the app if installed, in the browser if not. Both work identically.

## 6. Offline

- The scoring buffer is JS and already works in a WebView. Confirm it on device with aeroplane mode at hole 5, then signal back on.
- Add a native-only "no connection" banner using `@capacitor/network` so the amber bar appears instantly rather than after a failed save.

## 7. Icons, splash, names

- `@capacitor/assets` from a 1024px icon (the OB mark on navy) and a 2732px splash (navy, mark centred). Generates every size for both platforms.
- App name "Out of Bounds", subtitle "Live golf scoring". Bundle ID `com.outofboundsevents.scoring`. Android package the same.
- Haptics on the score keypad via `@capacitor/haptics`, light tap.

## 8. Building in the cloud: Codemagic

- `codemagic.yaml` in the repo: one workflow, triggered on tags `v*`, builds iOS and Android, runs the existing Playwright suite against the deployed site first, fails the build if tests fail.
- iOS signing: automatic, via an App Store Connect API key (App Manager role) that Karla creates in App Store Connect and pastes into Codemagic's integration settings. Codemagic creates and stores the certificates and profiles.
- Android signing: Codemagic generates and stores the upload keystore. Download the SHA-256 for `assetlinks.json`.
- Publishing: iOS build uploaded to TestFlight automatically. Android build uploaded to the Play Console internal track via a Google Play service account JSON (Karla creates in Google Cloud, grants in Play Console, pastes into Codemagic).
- Write `docs/RELEASE.md`: how to cut a release (tag, wait, TestFlight, submit), how to roll back, which secrets live where.

## 9. App Store Connect and Play Console setup (Karla, with exact steps from you)

- App record: name, bundle ID, category Sports, age 4+, primary language English (UK).
- Privacy policy page at `https://outofboundsevents.com/privacy` and terms at `/terms`: write them from what the app actually collects (name, email, photos, scores, device token) and who processes it (Supabase Ireland, Netlify, Resend, Stripe on the web only, Firebase for push). Plain English, UK GDPR. Same page used for both stores.
- Privacy nutrition label (Apple) and Data safety form (Google): name, email, photos, user content; nothing sold, nothing used for tracking.
- Screenshots: generated by Playwright from the demo organiser (Fairway Events) at 6.7" and 6.1" iPhone sizes and one Android size. Six per platform: events, set up, scoring, big screen, live day screen, results. No iPad on the first release.
- Reviewer access: Apple needs to sign in. Passwordless means you give them a reviewer route: email `review@outofboundsevents.com` with a fixed 6-digit code, enabled only when `REVIEWER_CODE` is set in Netlify env, landing on the Fairway Events demo as a Pro organiser. Put the email and code in App Review notes. Remove the env var after launch if you like.
- Review notes paragraph: what the app is, that players use links not the app, that payments happen on the website, and the reviewer sign-in.

## 10. Order and proof

1. Capacitor shell, remote URL, safe areas, icons. Build on Codemagic to TestFlight. Karla installs. Proof: screenshot from her phone.
2. Native sign-in, all three routes, universal link callback. Proof: Karla signs in with each on device.
3. Universal links for player and results pages. Proof: a WhatsApp link opens in the app.
4. Camera for scorecards and logos. Proof: scorecard read from the app camera.
5. Push: registration, one real notification to Karla's phone when a group goes amber on the demo.
6. Offline on device, aeroplane mode test.
7. Android build to Play internal track; Karla installs.
8. Store listings, privacy pages, screenshots, reviewer route. TestFlight to Ryan and Chris. Submit both.

One commit per step, one TestFlight build per step, nothing marked done until Karla has seen it on her own phone.

## 11. What's different for the LLG app (for the next brief, not this one)

The method carries over whole: Capacitor remote-loaded, Codemagic, same sign-in pattern, same push plumbing. Two things change.

- **Sign-in.** LLG members are signed in by Wix. The app shell loads `llg-app` pages, and the embed-pass handoff that works in the Wix app today has to be replaced by the member signing in directly in the native app (Wix members API via the Velo backend issuing the same signed pass, or Supabase auth with the Wix contact linked). Decide this before building; it is the whole job.
- **Payments.** Sessions and events are bought through Wix. Same rule: the app can show bookings and let members pick a session, but the checkout opens in the system browser on the Wix site, never inside the app. Loyalty points redemption is the same.

Everything else, from push ("Your session at The Beeches is tomorrow at 10") to the camera for the handicap card, is a straight copy of what you build here.
