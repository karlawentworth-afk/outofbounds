# Brief 007: merge readiness

Branch: design-system at rc10. Apple is In Review; the merge may be needed within a day.

1. Full-flow, complete. Run tests/full-flow.test.js with TEST_URL=branch until it runs to the end (retry once on ECONNRESET; if it resets twice, find out why, it may be the 10-second function limit on autofill 72). Paste the final summary line and the names of any failures. "N of N" only counts if the summary line says so and every section ran.

2. Journey tests. Fix the five SPA timing assertions in tests/journeys.test.js (wait for the text, do not assert on the first paint). Run against the branch. Target 15/15. Paste the tail.

3. Serious findings from docs/qa/bug-hunt-2026-10-26.md: there are 13. For each, either fix it now (if the fix is under 30 lines and has a test) or write one line saying why it waits. Fix order: anything that can lose or corrupt a score first, then anything a player sees, then organiser-only. Add a regression test for every fix. List fixed vs deferred in the report with the finding's table row number.

4. Merge dry run. In a temporary worktree: check out master, `git merge --no-ff --no-commit design-system`, report any conflicts by file. Do not commit. Diff netlify.toml, package.json, .netlifyignore and the functions directory between master and design-system and state in plain words what changes on production when this merges (new functions, removed functions, config changes, env vars the branch needs that production lacks, with names only). Remove the worktree.

5. Production smoke now, before any merge: run full-flow with TEST_URL=https://score.outofboundsevents.com and paste the summary line, so we have a before-number.

6. Move the rc10 tag to the current head (git tag -f design-system-rc10, push --force-with-lease the tag) only if 1 and 2 pass; otherwise tag rc11 on the commit that passes.

Report to docs/console-outbox/007-merge-readiness.md with: full-flow summary (branch and production), journeys tail, serious findings fixed/deferred table, merge dry-run result, and the plain-words production change list. Commit, push, wait-inbox.
