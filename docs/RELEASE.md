# Release process — Out of Bounds native app

## Cutting a release

1. Ensure all changes are merged to `master` and deployed to the live site.
2. Tag the release:
   ```
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. Codemagic picks up the tag and builds iOS + Android automatically.
4. iOS: uploaded to TestFlight. Karla and testers get a notification to install.
5. Android: uploaded to the Play Console internal track. Testers install from there.
6. Once tested on device, submit to App Store and Play Store via their consoles.

## Rolling back

- **Web fixes:** push to `master`. The app loads the live site, so web fixes are instant.
- **Native rollback:** tag a new version pointing at the last good commit and push it.
  Codemagic builds and publishes the rollback.
- **Emergency:** remove the app from sale in App Store Connect / Play Console while fixing.

## Where secrets live

| Secret | Location |
|--------|----------|
| App Store Connect API key (.p8) | Codemagic → Apple integration |
| APNs key (.p8) | Firebase project → Cloud Messaging |
| iOS signing (certs, profiles) | Codemagic (auto-managed) |
| Android upload keystore | Codemagic (auto-generated) |
| Google Play service account JSON | Codemagic env group `google_play` |
| Firebase service account JSON | Netlify env var `FIREBASE_SERVICE_ACCOUNT` |
| RESEND_API_KEY | Netlify env var |
| SUPABASE_SERVICE_KEY | Netlify env var |

## Version numbering

- `v1.0.0` — first App Store / Play Store release
- `v1.0.1` — native-only bug fixes
- `v1.1.0` — new native features (push categories, camera improvements)
- Web-only changes do not need a new version; the app loads the live site.
