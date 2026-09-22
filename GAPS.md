# Gaps — not yet built

Updated 22 September 2026, after Checkpoint 5 + course library + scorecard reader.

## Scoring (player view)

1. **Scorer takeover logging** — handover works but is not logged to score_edits.
2. **Handicap lock after first score** — player view warns but server does not enforce.
3. **Offline buffer flush on visibilitychange** — coded but not tested on a real phone offline.

## Organiser view

4. **Score editing function (org-score-edit)** — UI modal exists, backend function not built.
5. **Handicap edit with reason** — org-players PATCH exists but does not require a reason when scores exist.
6. **Group status dots (amber/red)** — UI shows groups but does not compute 40-min timeout or gap detection.
7. **"Run it again" clone** — button and stub exist, not tested end-to-end.
8. **"Add me" as player** — button exists, needs to split organiser display_name into first/last.
9. **Player invite form (self-registration)** — event_invites table exists, no join form or function.
10. **Add player after go-live (99p Checkout)** — not implemented, players can be added free.
11. **Secondary format allowance** — field exists, organiser setup UI does not expose it.
12. **Course review/confirm UI** — functions built (course-save-card, course-from-photo-background), organiser UI not wired up. The "Snap the scorecard" button, review screen, tee set tabs, amber cell flow, photo pinch-to-zoom, "This card is right" confirmation — all need building in /o/.
13. **Course report-a-card UI** — function built (course-report), player leaderboard tab link not added.
14. **Straighten-and-crop before upload** — spec calls for four-corner drag on skewed photos.

## Board

15. **Board blocked for Play events** — should 404 with "The big screen scoreboard is part of Pro".
16. **Sponsor slide data loading** — board code renders slides but the array is always empty (no fetch from event_slides).
17. **Leaderboard/results footer: course data line** — "Course data: club, tee, slope, rating. Checked by organiser on date" not yet shown.

## Pro tier (all gated behind plan check)

18. **Branding page** — logo upload, colour picker, live preview. Not built.
19. **Sponsor slides management** — add/edit/reorder/upload in organiser UI. Not built.
20. **Helper logins** — invite/revoke helpers. Table exists, no UI.
21. **CSV export** — button greyed with "Pro" label. Function not built.

## Auth and payments

22. **Google OAuth consent screen** — in Testing mode, needs verification for public launch.
23. **Apple Sign-In redirect URLs** — need configuring in Apple Developer portal with Supabase callback.
24. **Payment receipt** — Stripe sends its own; spec wants "Something wrong? Email us" line.
25. **Refund guard** — no refund once any score exists. Not enforced (manual anyway).

## Email

26. **No email sending yet** — Resend key set, no functions built. Needed for: player invite links, results published notification, organiser receipts.

## Course library

27. **GolfCourseAPI** — searches work, but free tier returns no tee/hole data. Useful for club name/location lookup only. Pro tier may have data; not tested.
28. **Course verified flag in search results** — courses added by Play users should show "unverified" until an organiser confirms.
29. **Two-photo merge on review screen** — front+back reads merge by tee set. Logic designed, UI not built.

## PWA and native

30. **Web manifest, service worker, add-to-home-screen prompt** — not built.
31. **Capacitor native wrap (Phase 2)** — not started.

## Smaller items

32. **OG image is SVG not PNG** — works in most places but some platforms prefer PNG.
33. **Hash URL redirect for results** — /r/#/org/event should redirect to /r/org/event.
34. **QR code on go-live** — uses a canvas grid, not a real QR encoder.
35. **course_holes migration** — 014_holes_per_tee.sql written but may not be run yet. Adds tee_id to course_holes so par/SI differ by rating_gender.
36. **course_tees tee_set→rating_gender migration** — 013_tee_rating_gender.sql written but may not be run yet.
