# Brief 022: upload the ten App Store screenshots through the ASC API (after 021)

Claude cannot drive the file picker in App Store Connect from the browser pane, so the upload is yours, through the App Store Connect API with the key from brief 011 (G8T7MQZNXP, issuer 4dea4042-16ea-4655-924e-485942eb9ce7, app 6820134986, version 1.0). Do 021 first so ipad-13/04.png is right.

Steps (the ASC "Uploading Assets" flow):
1. GET the app's App Store version 1.0 (platform IOS) → its appStoreVersionLocalizations (en-GB) → appScreenshotSets.
2. For the two display types we need, find or create the set: iPhone 6.9-inch = `APP_IPHONE_67`; iPad 13-inch = `APP_IPAD_PRO_3GEN_129` (the 12.9/13-inch Pro set, which App Store Connect labels "iPad 13-inch"). Print the existing sets and their display types first and pick the ones the current listing uses for those two sizes, so we replace what the reviewer saw rather than adding a third set.
3. Delete every existing appScreenshot in those two sets.
4. For each of the ten PNGs, in order 01 to 05: POST appScreenshots (reservation: fileName, fileSize, set relationship) → PUT the bytes to the uploadOperations (chunked, headers as given) → PATCH appScreenshots with `uploaded: true` and the MD5 `sourceFileChecksum`.
5. Poll each until `assetDeliveryState.state` is `COMPLETE` (fail on `FAILED` and print the errors).
6. Verify: GET both sets with their screenshots; assert 5 each, in order, COMPLETE, and the imageAsset width/height match 1320x2868 and 2064x2752.

Rules: never print the key or a JWT; put the script in scripts/asc-upload-screenshots.js and reuse the JWT code from brief 011; retry on 5xx once; do not touch any other set, the build, the version text or the submission. Do NOT resubmit; Claude does that.

Report to docs/console-outbox/022-upload-screenshots-asc.md with the set ids, display types, and the final verification listing. Commit, push, wait-inbox.
