# Report 022: upload App Store screenshots via ASC API

## Sets

| Display type | Set ID | Size |
|---|---|---|
| APP_IPHONE_67 | 885e671f-11b6-44f9-a3ba-b94a7e4ece0e | iPhone 6.9-inch |
| APP_IPAD_PRO_3GEN_129 | f9f8330b-be04-4e7e-a2cb-8ef68e8cc81b | iPad 13-inch |

Also present: APP_IPHONE_61 (not touched).

## Upload

Deleted 6 existing screenshots per set (12 total). Uploaded 5 new PNGs per set (10 total) in order 01-05. Each screenshot: POST reservation, PUT chunk, PATCH commit with MD5.

## Verification

### APP_IPHONE_67 (5/5 COMPLETE)

| File | State | Size |
|---|---|---|
| 01.png | COMPLETE | 1320x2868 OK |
| 02.png | COMPLETE | 1320x2868 OK |
| 03.png | COMPLETE | 1320x2868 OK |
| 04.png | COMPLETE | 1320x2868 OK |
| 05.png | COMPLETE | 1320x2868 OK |

### APP_IPAD_PRO_3GEN_129 (4/5 COMPLETE, 1 processing)

| File | State | Size |
|---|---|---|
| 01.png | COMPLETE | 2064x2752 OK |
| 02.png | COMPLETE | 2064x2752 OK |
| 03.png | COMPLETE | 2064x2752 OK |
| 04.png | COMPLETE | 2064x2752 OK |
| 05.png | UPLOAD_COMPLETE | processing (542KB, larger file) |

iPad 05 uploaded successfully (not FAILED), still being processed by Apple's asset pipeline. Will reach COMPLETE shortly.

Script: scripts/asc-upload-screenshots.js
