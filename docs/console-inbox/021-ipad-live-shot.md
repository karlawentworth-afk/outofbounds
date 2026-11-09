# Brief 021: iPad 13-inch live screenshot (04) and the wide live layout

Claude checked all ten screenshots from ios-rc7. Nine are acceptable. docs/store/ios/ipad-13/04.png is not: it was captured before the leaderboard loaded ("Groups · 0 of 10 scoring", every group "Not started, tee time was ...", no leaderboard rows), and at 1032 CSS px wide the live screen's two-column layout squeezes the ten group cards into three very thin columns with the status text wrapping over five lines.

1. Live screen layout at 1032x1376 (iPad 13-inch) and 1024-1200 widths generally: give the group cards a sensible minimum width (`grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` or equivalent) and, if the two-column layout leaves the groups column under ~420px, stack the sections instead. Check at 820x1180 (fine today, keep it) and 1032x1376.
2. Retake ipad-13/04.png: Spring Charity Classic, Live tab, after `#live-groups-list` has 10 `.lg` buttons and `#live-leaderboard` has 20+ rows (assert before capture, as brief 020's test does). Head should read "10 of 10 groups scoring", leader 24 thru 9. Overwrite and commit.
3. Nothing else changes. Run the native assertions and the cropping test; paste the tails. Tag `ios-rc8`.

Report to docs/console-outbox/021-ipad-live-shot.md. Commit, push, wait-inbox.
