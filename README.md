# Out of Bounds — Live Golf Scoring

Live Stableford scoring for any golf event. Players score on their phones,
organisers manage from anywhere, the leaderboard runs on the clubhouse telly.

**Production:** score.outofboundsevents.com
**Marketing:** outofboundsevents.com

---

## Tiers

| Feature | Play | Pro |
|---|---|---|
| Price | £9.99 + 99p/player | Monthly / annual |
| Formats | Individual, BB pairs, BB 2-from-4 | Same |
| Player scoring (phone) | ✓ | ✓ |
| Organiser dashboard | ✓ | ✓ |
| Live leaderboard (phone) | ✓ | ✓ |
| Big screen board (/board) | — | ✓ |
| Custom branding (logo, colours) | — | ✓ |
| Sponsor slides on board | — | ✓ |
| CSV export | — | ✓ |
| Helper logins | — | ✓ |
| Results page | ✓ (OOB branding) | ✓ (org branding) |

Play is the default. Pro is the same account with `organisers.plan` set
to `'annual'` or `'per_event'` (for legacy). Play users see Pro features
greyed out, never hidden entirely.

---

## Environment Variables (Netlify)

| Variable | What it does |
|---|---|
| `SUPABASE_URL` | `https://ahutmswadskdkqhnrhhh.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key (never the anon key) |
| `APP_BASE_URL` | `https://score.outofboundsevents.com` |
| `STRIPE_SECRET_KEY` | Stripe API key (test: `sk_test_...`, live: `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_FROM` | `noreply@outofboundsevents.com` |
| `ANTHROPIC_API_KEY` | Claude API key (for scorecard photo reader) |
| `GOLFCOURSEAPI_KEY` | GolfCourseAPI key (course name lookup, free tier) |

---

## Onboarding a New Organiser

### Play (self-serve)
1. They go to `/o/`, sign in with Google/Apple/email.
2. First sign-in: enter display name and what they run.
3. Create event, add players, pay, go live.

### Pro (manual, for now)
1. Create the organiser in Play as above.
2. In Supabase Studio, update `organisers.plan` to `'annual'`.
3. Upload their logo to Supabase Storage, set `logo_url`.
4. Set `primary_colour`, `accent_colour`, `text_on_primary`.
5. The board, branding page, sponsor slides, CSV export and helpers
   unlock automatically.

---

## Seeding a Demo Event for a Prospect

Run `sql/008_seed.sql` in Supabase Studio. It creates:
- Organiser "Demo Charity Events" (slug: `demo-events`)
- Course "Oakwood Park" (18 holes, slope 128, rating 71.2)
- Event "Demo Charity Day" (BB 2-from-4, 85%, live)
- 12 players in 3 groups with partial scores

Demo URLs:
- Board: `/board/#/demo-events/demo-charity-day`
- Results: `/r/demo-events/demo-charity-day`
- Player: `/p/#/demo-events/demo-charity-day/tok-sarah-001`
- Find name: `/p/#/demo-events/demo-charity-day`

---

## Apple Sign-In Client Secret

- **.p8 key file:** `AuthKey_BBJ4DP7AV3.p8` in the repo root (gitignored)
- **Key ID:** `55KL45AR6V`
- **Team ID:** `69UCJQNR64`
- **Services ID:** `BBJ4DP7AV3`
- **Current secret expires:** 21 March 2027

### To regenerate:
```bash
node scripts/generate-apple-secret.js
```
Paste the output into Supabase → Authentication → Providers → Apple → Secret Key.

---

## Stripe

### Test mode (current)
- Use test keys (`sk_test_...`) in Netlify env vars.
- Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

### Going live
1. Swap `STRIPE_SECRET_KEY` to the live key (`sk_live_...`).
2. Create a new webhook in the Stripe dashboard pointing to
   `https://score.outofboundsevents.com/.netlify/functions/stripe-webhook`.
3. Swap `STRIPE_WEBHOOK_SECRET` to the new webhook's signing secret.
4. Remove the test webhook.

### Webhook URL
`https://score.outofboundsevents.com/.netlify/functions/stripe-webhook`

Events listened to: `checkout.session.completed`

---

## Known Limitations

1. **Google OAuth consent screen** is in Testing mode. Only test users
   can sign in until the app is verified by Google. Add test emails in
   Google Cloud Console → OAuth consent screen → Test users.
2. **No native app yet.** Phase 2: Capacitor wrap with push notifications,
   QR scanner, universal links. PWA manifest and service worker not yet
   added.
3. **OG image is SVG, not PNG.** WhatsApp renders it but some platforms
   prefer PNG. A canvas-based PNG renderer is a future improvement.
4. **No automated email sending** yet (Resend key set but no send
   functions built). Player invite emails, magic link emails use
   Supabase Auth's built-in sender.
5. **Score editing by organiser** — the UI is built but the backend
   `org-score-edit` function is not yet implemented.
6. **No "Run it again" clone function** — the button is in the UI but
   the `clone` action on `org-events` needs testing.

---

## Build Rules

These are non-negotiable across the codebase:

- **Vanilla HTML/JS/CSS.** No frameworks. No build step.
- **Netlify static site + Netlify functions.** Supabase (Postgres) for data.
- **Deploy via `git push` only.** Never run `netlify deploy --prod`.
- **9-second AbortController** on every function call.
- **Cookies and URL hash,** never localStorage for anything that must
  survive (the offline score buffer is the one exception).
- **ALL database reads and writes go through Netlify functions** using
  `SUPABASE_SERVICE_KEY`. The anon key is used client-side only for
  Supabase Auth.
- **Mobile first.** Player view and organiser view are phones.
- **UK English** throughout.

---

## Folder Layout

```
/public
  /p            player view (scoring, nomination, leaderboard)
  /o            organiser dashboard (auth, events, players, groups)
  /board        scoreboard (big screen for clubhouse)
  /r            results page (SSR via function)
  /privacy      privacy policy
  /shared       engine.js, api.js, theme.js
  /img          OOB logos
  /marketing    (content now at /index.html)
/netlify/functions
  /shared       supabase.js helper
  config-get, player-context, player-nominate, score-save,
  leaderboard, event-players, org-auth, org-events, org-players,
  org-groups, org-courses, stripe-checkout, stripe-webhook,
  results-page, results-og, course-search, course-import,
  course-report, course-save-card, course-from-photo-background,
  scorecard-read-status
/sql            numbered migration files (001-014)
/tests          engine tests, tenancy tests
/scripts        apple-secret generator
```
