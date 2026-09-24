# CLAUDE.md — rules for building Out of Bounds

## The stranger test

Every screen must pass this before it ships. Look at it as someone
who has never seen the product:

1. **What is this?** The heading says what the page is for.
2. **What do I do here?** The main action is obvious and named in
   words a golfer or organiser would use, not internal terms.
3. **What just happened?** Every action ends with a sentence saying
   what changed and what, if anything, to do next.

No internal names on screen, ever: comp, per_event, SA, slug,
token, org. Use "free Pro", "Play", "you", "link".

"Done" means the stranger test passes, not that the function runs.

## No endless spinners

Every spinner or loading state must resolve within 10 seconds to
either the expected content or a plain message: "That didn't work,
try again." Never an endless spinner.

## No browser dialogs

Never use `window.prompt()`, `window.alert()`, or `window.confirm()`.
Use the site's own bottom sheet or modal (oobConfirm, oobPrompt,
oobAlert in /o/; showSheet in /p/). The only exception is
`deferredPrompt.prompt()` for the PWA install flow.

## Build rules

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
- **Nothing external at runtime** except fonts (Google Fonts) and
  Supabase Auth (SDK). QR codes, contrast checks, scoring engine —
  all client-side or in our functions. No third-party APIs called
  from the browser.

## Secret handling

Never ask the user to paste API keys. Load env vars from Netlify CLI
with the appropriate context (`--context production` or
`--context branch-deploy`). If a local `.env` is needed, confirm it
is in `.gitignore` and delete it when done.

## Every push

Fetch the live URL with a cache-buster and grep for a string only in
the new build before saying it is live:

```bash
curl -s "https://outofboundsscoring.netlify.app/<path>?_cb=$(date +%s)" | grep '<unique-string>'
```

## Scorecard layout

Golf scorecards are holes 1-9 (front nine / OUT) and 10-18
(back nine / IN), never 1-10 and 11-18.

## Verified live

Never say "verified live" unless you have opened the deployed URL
in a browser (Playwright counts) and seen the expected behaviour.
A curl to the HTML or a function endpoint is not verification —
the page must render and the feature must work. If you cannot
verify in a browser, say "deployed but not browser-tested".

## Commit messages

One feature or fix per commit. Describe the "what" and "why" in
plain English. End with the co-author tag.
