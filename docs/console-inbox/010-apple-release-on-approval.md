# Brief 010: release on Apple approval (Karla has authorised this, 30 Oct)

This brief stays open. Do it alongside other briefs; it does not block the inbox loop.

The earlier rule "do NOT release on PENDING_DEVELOPER_RELEASE" is withdrawn for version 1.0 only. Update CLAUDE.md accordingly (release 1.0 on approval; future versions need Karla's word again).

Every hour, with ASC key G8T7MQZNXP, check the app store version state for app 6820134986 version 1.0.
- WAITING_FOR_REVIEW or IN_REVIEW: no action. Note the time in docs/console-outbox/apple-status.md only if the state changed.
- PENDING_DEVELOPER_RELEASE: release it via the API (create the appStoreVersionReleaseRequest). Poll until READY_FOR_SALE. Then: set STORE_LIVE true on master (the full flag, both store badges), push, confirm the production deploy, load https://outofboundsevents.com and screenshot the hero with both badges at 1280 and 390, save under docs/screens/store-live/. Write docs/console-outbox/apple-status.md with the timestamp, the App Store link (https://apps.apple.com/app/id6820134986), and the screenshot paths.
- REJECTED or DEVELOPER_REJECTED or any state containing "REJECT": do not resubmit. Fetch the Resolution Center message(s) via the API, write them verbatim to docs/console-outbox/apple-status.md, and stop touching Apple until a new brief says otherwise.
- Any other state: write it to apple-status.md and carry on polling.

Never touch the build, metadata, screenshots, review notes or App Privacy. Never change the release type.
