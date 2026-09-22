# Gaps — not yet built

## From the v1 build brief

1. **Player invite form (self-registration)**
   Players opening the invite link can enter name, email, handicap and add themselves.
   The `event_invites` table exists but the form and `invite-join` function are not built.

2. **"Add me" button on organiser player list**
   UI button exists but needs to split the organiser's display name into first/last and
   add them as a player.

3. **Score editing by organiser (org-score-edit function)**
   The organiser UI has the edit modal but there is no `org-score-edit` Netlify function
   to persist the change and log it to `score_edits`.

4. **Organiser score edit: change handicap after scores exist**
   Spec says a reason is required and it must be logged. The `org-players` PATCH exists
   but does not enforce the reason requirement when scores exist.

5. **Scorer takeover logging**
   "Take over scoring" on the non-scorer phone works but the handover is not logged
   to `score_edits` or an equivalent audit table.

6. **Group status dots (amber/red) on organiser live view**
   The spec defines: amber = no scorer or no score in 40 minutes, red = gap in card.
   The organiser UI shows groups but does not compute these states from the data.

7. **"Run it again" clone action**
   Button exists in the UI. The `org-events` function has a `clone` action stub but
   it is not tested end-to-end.

8. **CSV export (Pro only)**
   Button is greyed out with "Pro" label. The `org-export` function is not built.

9. **Branding page (Pro only)**
   Not built. Pro organisers cannot yet upload a logo or set colours from the UI.

10. **Sponsor slides management (Pro only)**
    The `event_slides` table exists and the board rotates slides, but there is no
    organiser UI to add/edit/reorder slides.

11. **Helper logins (Pro only)**
    The `organiser_users` table supports owner/organiser/helper roles but there is no
    UI to invite helpers or manage their access.

12. **Board route blocked for Play events**
    Spec says `/board` should 404 for Play events with "The big screen scoreboard is
    part of Pro". Currently the board works for all events.

13. **Email sending (Resend)**
    `RESEND_API_KEY` is set but no functions send email. Needed for: player invite
    emails, results published notification, organiser receipts.

14. **Handicap lock after first score**
    Spec says playing handicap is locked once a score exists. The player view shows
    "Ask the organiser to change this" but the server does not enforce the lock.

15. **Secondary format handicap allowance**
    The `secondary_allowance` field exists but the organiser setup UI does not expose it.
    It defaults to the primary allowance.

## From the Play tier brief

16. **Adding a player after go-live (99p Checkout)**
    Spec says adding a player after go-live triggers a 99p Stripe Checkout.
    Not implemented — players can be added free after go-live.

17. **Payment receipt with "Something wrong? Email us"**
    Stripe sends its own receipt but the spec wants a custom line.

18. **Refund guard: no refund once any score exists**
    Not enforced. Refunds are manual anyway.

## From the PWA brief

19. **Web manifest, service worker, add-to-home-screen prompt**
    Not built. No `manifest.json`, no service worker, no install prompt.

20. **Capacitor native wrap (Phase 2)**
    Not started. Depends on Checkpoint 5 completion.

## From the sponsor slides / secondary format additions

21. **Sponsor slide placement = 'player'**
    The leaderboard tab on the player view should show a sponsor banner at the top
    for Pro events. Not implemented.

22. **Board sponsor slide rotation**
    The board code has slide rendering but the data loading (`event_slides`) is
    stubbed out — slides array is always empty.

## Smaller items

23. **OG image is SVG not PNG.** Works in most places but some platforms want PNG.
24. **Old hash URL redirect for results.** `/r/#/org/event` should redirect to `/r/org/event`.
25. **QR code on go-live** uses a canvas grid, not a real QR encoder. Needs `qrcode-generator` library or similar.
26. **Google OAuth consent screen** is in Testing mode — needs verification for public launch.
27. **Course search "unverified" flag** — courses added by Play users should be flagged.
