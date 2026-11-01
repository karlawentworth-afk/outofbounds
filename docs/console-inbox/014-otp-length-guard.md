# Brief 014: OTP length guard

Found by a real tester on 31 Oct: Supabase was sending 8-digit codes while the app's code field accepts 6. Claude changed Supabase's Email OTP length to 6 in the dashboard. Nobody who signed in by email could have succeeded before this.

1. Make the code field tolerant: accept 6 to 10 digits, trim spaces, and send whatever was typed to verifyOtp. Keep the placeholder as "6-digit code" but do not reject longer input client-side.
2. Add a live check to the suite: request a code for oob-test-nonmember@mailinator.com via send-otp, read the email from mailinator, assert the code is exactly 6 digits, and assert that entering it on the branch/production sign-in screen reaches the dashboard (a throwaway organiser is created, clean it up after). This is the end-to-end proof that email sign-in works for a stranger; it must pass before any future tag.
3. Run it against production. Paste the tail.

Report to docs/console-outbox/014-otp-length-guard.md. Commit, push, wait-inbox.
