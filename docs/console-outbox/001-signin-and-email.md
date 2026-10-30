# Report 001: sign-in link, email code, sign-in photo

Tag: `design-system-rc7`
Branch deploy: https://design-system--outofboundsscoring.netlify.app/o/

## Item 1: Origin-aware OTP

**Done.** New Netlify function `send-otp.js` validates the request Origin header:
- Must end in `outofboundsscoring.netlify.app` or `outofboundsevents.com`
- Falls back to `DEPLOY_PRIME_URL`, then `https://outofboundsevents.com`
- Passes the validated origin as `redirect_to` to Supabase GoTrue `/auth/v1/otp`
- Client updated to call this function instead of `sb.auth.signInWithOtp()` directly

The client now shows a 6-digit code entry form after sending, and calls `sb.auth.verifyOtp()` to complete sign-in. This works on any origin because OTP verification is origin-independent.

Playwright test confirms: branch origin `https://design-system--outofboundsscoring.netlify.app` is accepted and reflected in the redirect URL. Invalid origins fall back to production.

## Item 2: Email code as headline

**Blocked.** The email subject and body template are configured in the Supabase Dashboard (GoTrue email templates for project `ahutmswadskdkqhnrhhh`). Updating them requires either:
- The Supabase Dashboard: https://supabase.com/dashboard/project/ahutmswadskdkqhnrhhh/auth/templates
- A Supabase Management API personal access token (not available)

The Resend API key is also corrupted (reported separately), so custom email sending is not an option.

**Template to paste in the dashboard** (Magic Link template):

Subject: `Your Out of Bounds sign-in code is {{ .Token }}`

Body:
```html
<h1 style="font-family:sans-serif;font-size:36px;letter-spacing:0.1em;text-align:center;margin:32px 0 8px;">{{ .Token }}</h1>
<p style="font-family:sans-serif;font-size:16px;text-align:center;color:#555;">Enter this code in the app to sign in.</p>
<p style="font-family:sans-serif;font-size:14px;text-align:center;color:#888;margin-top:24px;"><a href="{{ .ConfirmationURL }}">Or tap here to sign in</a></p>
```

## Item 3: Sign-in course photo

**Done.** The `.auth .hero` section now has `course-wide.jpg` as a background image with a 72% navy overlay (`rgba(16,52,78,0.72)`). The OB mark, "Sign in" heading, and subtitle remain white with full contrast against the overlay.

### signin-390.png (mobile, 390x844)

Top half: golf course photo (green, a white ball on the putting green near a flag, blue sky) visible through a dark navy overlay. The white OB mark sits bottom-left of this section, with "Sign in" in bold white Poppins below it and "Set up and run your golf day." in muted light text underneath.

Bottom half: white panel with rounded top corners containing three buttons stacked vertically. "Continue with Google" (grey outline, Google G icon), "Continue with Apple" (grey outline, Apple logo), a thin "or" divider, and "Continue with email" (solid green, envelope icon). Below: "No passwords. We only email you about your events." in small muted text.

### signin-1280.png (desktop, 1280x800)

Left panel (~60% width): same course photo with navy overlay, OB mark centred vertically, "Sign in" heading, subtitle. The photo fills the full height.

Right panel (480px): white background, vertically centred. Same three buttons and fine print as mobile. No rounded corners on desktop.

## Item 4: Suite

```
engine.test.js:        41/41 passed
pluralise.test.js:     14/14 passed
send-otp (new):         8/8  passed
full-flow.test.js:     27/39 passed (12 pre-existing failures: group status, score edit audit, clone)
```

The 12 full-flow failures are pre-existing and unrelated to this change (group status timing, score_edits audit table, clone player verification).

## send-otp test output (branch deploy)

```
=== send-otp + sign-in tests ===

  PASS  Branch origin resolved - origin=https://design-system--outofboundsscoring.netlify.app
  PASS  Redirect starts with branch URL - redirect=https://design-system--outofboundsscoring.netlify.app/o/
  PASS  Invalid origin falls back to prod - origin=https://outofboundsevents.com
  PASS  Empty email returns 400 - status=400
  PASS  Sign-in screen visible
  PASS  Email field visible
  PASS  Hero has course photo - linear-gradient(rgba(16, 52, 78, 0.72), rgba(16, 52, 78, 0.72)), url("https://de
  PASS  Button says Send me a code - Send me a code

8/8 passed, 0 failed
```
