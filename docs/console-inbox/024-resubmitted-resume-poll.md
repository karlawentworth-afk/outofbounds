# Brief 024: resubmitted 9 Nov evening. Resume the Apple poll (standing brief 010 applies).

Claude posted the reply to App Review (Messages now 4), clicked Update Review on the version, and resubmitted 1.0 (8) at about 19:45 UK on 9 Nov. State: Waiting for Review. Release type AFTER_APPROVAL (automatic).

- Resume the hourly poll from brief 010. Update docs/console-outbox/apple-status.md on each state change.
- On READY_FOR_SALE: do not attempt a release request; flip STORE_LIVE to true on master, push, confirm the production deploy, screenshot the hero with both store badges, and write apple-status.md with the App Store link.
- On any REJECTED: write the Resolution Centre message verbatim to apple-status.md (the API cannot read it, so write what the API gives and flag that Claude must read the message in App Store Connect) and stop. Do NOT resubmit.
- Nothing else changes on master until Apple answers. No tags, no deploys, unless Claude sends a brief.

Report to docs/console-outbox/024-resubmitted-resume-poll.md (one line acknowledging), then poll.
