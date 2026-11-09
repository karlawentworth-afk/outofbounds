# Brief 023: clear the old iPhone 6.1-inch screenshots and confirm iPad 05

Two minutes of API work before Claude resubmits.

1. The APP_IPHONE_61 set still holds the old-design screenshots Apple rejected under 2.3.3. Delete every appScreenshot in that set (and the set itself if the API allows a set with zero screenshots to be deleted; otherwise leave the empty set). Do not upload anything to it. Verify it has 0 screenshots.
2. Poll ipad-13/05 in set f9f8330b-be04-4e7e-a2cb-8ef68e8cc81b until assetDeliveryState is COMPLETE. If it goes FAILED, re-upload it once and poll again.
3. List every appScreenshotSet on version 1.0 en-GB with display type and screenshot count, so the report shows exactly what Apple will see: APP_IPHONE_67 = 5, APP_IPAD_PRO_3GEN_129 = 5, anything else = 0.

Do NOT resubmit. Report to docs/console-outbox/023-clear-old-set.md. Commit, push, wait-inbox.
