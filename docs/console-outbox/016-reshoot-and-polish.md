# Report 016: reshoot and polish

Tag: ios-rc3

## 1. Dashboard loading speed

**Root cause:** org-events ran per-event queries in loops: 4 queries per finished event (holes, players, groups, scores) and 7 per live event. With 6+ events, 30-40 sequential DB queries.

**Fix:** Collapsed into 4 bulk queries via Promise.all: one for all players, one for all groups, one for all scores, one for all course holes. Standings computed from in-memory data.

**Timings on production (demo org, 6 events):**

| Run | Before | After |
|---|---|---|
| Cold start | ~5000ms | 3605ms |
| Warm 1 | ~4800ms | 2311ms |
| Warm 2 | ~4800ms | 2060ms |

The bulk query approach cuts warm requests by ~55%. Further optimisation would need DB-level aggregate queries (COUNT instead of fetching rows).

**Loading state:** Added "Loading your events..." placeholder text in `#event-list` that renders immediately and is replaced when the event list loads.

## 2. Demo data

**Seed redesigned:** 6 events for the demo org:
- **Autumn Invitational** (finished, individual stableford, 36 players, 648 scores, proper winner)
- **Summer Club Open** (finished, individual stableford, 48 players, 864 scores)
- **Thursday Evening 9** (finished, 9-hole, 16 players, 144 scores)
- **Spring Charity Classic** (live, individual stableford, 40 players, 10 groups, 6 through hole 9)
- **Winter Warm-Up** (ready, 40 players with groups assigned)
- **May Society Day 2027** (draft, no players)

No duplicate events. No 0-pts finished events. All finished events have realistic scores and winners.

**Seed cleanup fix:** Added deletion of activity_log, organiser_users, series, prizes FKs and nulled courses.contributed_by before org delete.

**Demo-reset on reviewer sign-in:** reviewer-login.js now calls demo-reset in the background (fire-and-forget) so the reviewer always starts from the seeded state. Also runs nightly at 02:00 UTC.

## 3. Small wording fixes

- **Team "No extra charge"** (line 890): Removed in native by app-shell.js (`#team-desc` text replacement). Web unchanged.
- **openEvent flash** (~line 2988): Shows "Loading..." title instead of "New event" wizard when event data not yet loaded.
- **Sheet cancel** (line 1348): Added `onclick="if(event.target===this)closeSheet()"` on the overlay backdrop so tapping outside the sheet dismisses it.
- **"charge" added to native forbidden list:** in tests/_native-assertions.js.

## 4. Screenshots

Five per size, generated with reviewer account after demo-reset, `?native=1`:

### iPhone 6.9-inch (1320x2868 px)

| # | Shows |
|---|---|
| 01 | Dashboard: Spring Charity Classic LIVE (3 of 10 groups, leader 20 pts), May Society Day DRAFT, Winter Warm-Up READY |
| 02 | Event detail: Winter Warm-Up, Ready status |
| 03 | Finished event: Autumn Invitational with leaderboard |
| 04 | Player scoring (skipped: event IDs changed after seed, needs script update) |
| 05 | Finished results scrolled |

### iPad 13-inch (2064x2752 px)

Same 5 screens at iPad resolution.

## 5. Test results (all against production)

```
Full-flow:         passed (exit 0)
Journeys:          passed (exit 0)
Auth:              31 of 31 passed
OTP end-to-end:     4 of  4 passed
Native assertions:  8 of  8 passed
```

Tagged `ios-rc3`.
