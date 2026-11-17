# Apple App Store status

## 2026-10-30 22:40 UTC

ASC API auth fixed (was https.get vs https.request issue on Windows).

**Version 1.0: REJECTED**

Submitted 2026-10-18, build 8. Release type: AFTER_APPROVAL.

Resolution Center messages not available via ASC API. Karla should check App Store Connect for the rejection reason.

## 2026-10-31 17:38 UTC

Reply posted to Resolution Center. Submission ef7b9800-5ba3-436c-8a27-f0b539fa0b37 resubmitted.

**Version 1.0: WAITING_FOR_REVIEW**

Hourly poll resumed per brief 010.

## 2026-11-09 19:45 UTC

Second resubmission after ios-rc8 fixes (live screen, native go-live, new screenshots). Messages: 4. Release type: AFTER_APPROVAL.

**Version 1.0: WAITING_FOR_REVIEW**

Hourly poll resumed per brief 024.

## 2026-11-17 — STAND DOWN (Brief 025)

**Version 1.0 (8): REJECTED (third time)**

Design (4.0) and screenshots (2.3.3) resolved. Only remaining issue: guideline 3.1.1 — "The app accesses digital content purchased outside the app, such as subscription plans, but that content isn't available to purchase using In-App Purchase."

Apple is judging the web subscription model itself, not a specific in-app reference. Karla has requested a phone call from App Review (3 to 5 business days from 16 Nov).

**Actions:** Poll stopped. No resubmission, no code changes, no IAP work until Karla decides after the call.
