# Report 014: OTP length guard

## 1. Code field tolerance

Both code inputs (`#reviewer-code` and `#otp-code`) in public/o/index.html now accept 6 to 10 digits. `maxlength="10"`, `pattern="[0-9]{6,10}"`. Placeholder stays "6-digit code".

`verifyOtp()` strips spaces and accepts 6-10 characters. Error message changed from "Enter the 6-digit code" to "Enter the code from your email."

## 2. End-to-end OTP test

`tests/otp-e2e.test.js` — full stranger sign-in:

1. Loads /o/ sign-in screen
2. Enters a unique @mailinator.com email via the UI
3. Clicks "Send me a code" (calls send-otp)
4. Waits for the OTP code field to appear
5. Reads the email from mailinator in Playwright
6. Asserts the code is exactly 6 digits
7. Enters the code and clicks "Sign in"
8. Asserts the dashboard or onboard screen loads
9. Cleans up the Supabase user

## 3. Production run: 4/4

```
URL: https://score.outofboundsevents.com

  PASS  Sign-in screen loaded — screen=signin
  PASS  Code field appears after send — visible=true
  PASS  Email received with 6-digit code — length=6
  PASS  Sign-in reached dashboard or onboard — screen=onboard

4 of 4 steps passed
```
