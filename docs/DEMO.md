# Demo Pitch Script

Ten-minute run for Chris and Ryan. One laptop, two phones, a telly.

## Before the pitch

1. **Rebrand demo** (2 min before)
   - Sign in at `score.outofboundsevents.com/o/`
   - Admin > Rebrand demo
   - Set the prospect's name, logo URL, and primary colour
   - Save — the board and player views now show their brand

2. **Set up the room**
   - Laptop: open the board at `score.outofboundsevents.com/board/#/demo/autumn-invitational`
   - Connect to the telly via HDMI — board auto-rotates
   - Phone 1 (yours): open `score.outofboundsevents.com/p/#/demo/autumn-invitational/demo-scorer-group-001-token`
   - Phone 2 (Chris): open `score.outofboundsevents.com/p/#/demo/autumn-invitational/demo-scorer-group-002-token`
   - Phone 3 (optional, Ryan): `demo-scorer-group-003-token`

## The demo (10 min)

### 1. "This is what your players see" (2 min)
- Show Phone 1 — the scoring screen
- "Each player opens their personal link. No app to download."
- Tap a score on the numpad, save
- "That score is live on the board" — point to the telly
- High score guard: enter a 9 on a par 3 — "Sure?" bottom sheet appears

### 2. "This is what you see" (2 min)
- Switch to the laptop, open `/o/`, go to the live event
- "Groups with a green dot are scoring. Amber means no score for 45 minutes. Red means a hole was skipped."
- "The leaderboard updates in real time. Players see it on their phones too."
- Show the leaderboard tab on Phone 1

### 3. "Watch the board" (1 min)
- The board is rotating on the telly
- Wait for the sponsor slide — "That's your sponsor. Their logo rotates between the leaderboard pages."
- "The board runs on any screen with a browser. TV in the clubhouse, iPad in the bar."

### 4. "After the round" (2 min)
- "When everyone's in, you tap Finish."
- Open a finished event from the list (e.g. Spring Charity Classic)
- Show the results page — "This is what gets shared on WhatsApp"
- Tap Share on WhatsApp — show the preview with OG image
- "Run it again copies all the players into a new event"

### 5. "The back office" (2 min)
- Show the draft event (Winter Warm-Up): "40 players uploaded, ready to go"
- Show the people list: "Everyone who's ever played is here. You pick from the list next time."
- Show the branding page: "Your colours, your logo, everywhere"
- Show the billing page: "Pro is £39.99 a month or £399 a year. Includes the board, branding, your people list, CSV export."

### 6. "One more thing" (1 min)
- Score another hole on Phone 2
- Board updates on the telly
- "Every score, every phone, every screen — live."

## After the pitch

1. **Reset demo**
   - Admin > Reset demo
   - Or: `node scripts/seed-demo.js` from the repo
   - The demo resets nightly at 03:00 anyway — anything you created during the pitch is gone by morning

## URLs

| What | URL |
|------|-----|
| Board | `score.outofboundsevents.com/board/#/demo/autumn-invitational` |
| Phone 1 (scorer) | `score.outofboundsevents.com/p/#/demo/autumn-invitational/demo-scorer-group-001-token` |
| Phone 2 (scorer) | `score.outofboundsevents.com/p/#/demo/autumn-invitational/demo-scorer-group-002-token` |
| Phone 3 (scorer) | `score.outofboundsevents.com/p/#/demo/autumn-invitational/demo-scorer-group-003-token` |
| Find your name | `score.outofboundsevents.com/p/#/demo/autumn-invitational` |
| Results (finished) | `score.outofboundsevents.com/r/demo/spring-charity-classic` |
| Organiser | `score.outofboundsevents.com/o/` |

## QR cards

Print QR codes for the three fixed scorer tokens. They survive every reset — same tokens every time.
