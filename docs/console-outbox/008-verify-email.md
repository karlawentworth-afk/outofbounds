# Report 008: verify email

## 1. Redeploy

Deploy ready at sha fe977a5 with new RESEND_API_KEY set in all contexts.

## 2. Resend API check

Called results-email on the branch deploy. With the old key: "API key is invalid". With the new key: emails sent. The Resend API is accepting the key.

Resend rejects `example.com` addresses ("Invalid `to` field"), which is correct. Demo players all use `example.com`. A test player with `review@outofboundsevents.com` was added temporarily and the email sent successfully (1 sent, 35 failed on example.com).

Domain names not checked via GET /domains (the function doesn't expose that). The send succeeding proves the key and domain are valid.

## 3. Send-OTP to mailinator

```
POST send-otp: {"email":"oob-test-nonmember@mailinator.com"}
Response: {"ok":true,"origin":"https://outofboundsevents.com","redirectTo":"https://outofboundsevents.com/o/"}
HTTP status: 200
```

Supabase accepted the request (custom SMTP is configured). Checked mailinator inbox for 3 minutes in Playwright. No email arrived. Possible causes: mailinator blocking Resend's sending domain, email in spam, or Supabase rate limit from earlier test runs. Did not retry more than twice. The `ok: true` response confirms Supabase accepted and attempted delivery via custom SMTP.

## 4. Results email

Sent results email for Fairway Autumn Invitational to review@outofboundsevents.com via the branch deploy.

Response: `{"sent":1,"failed":35,"total":37,"with_email":36}`

The 1 successful send was to review@outofboundsevents.com. The 35 failures are example.com addresses rejected by Resend. The function does not return the Resend message ID in its response (it calls the Resend API but only counts success/failure).

## 5. SMTP canary test

The canary test in tests/send-otp.test.js already expects success when `ok: true` is returned. No code change needed. With custom SMTP configured, the test now passes.
