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

## Commit messages

One feature or fix per commit. Describe the "what" and "why" in
plain English. End with the co-author tag.
