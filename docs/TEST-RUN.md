# Test Run Checklist

Run through before every production merge. 20 minutes, phone + desktop.

## Setup
- [ ] Open `/o/` on desktop, sign in with Google
- [ ] Open `/p/` on phone (or two phones if available)

## Sign-in and onboarding
| Step | Phone | Desktop |
|------|-------|---------|
| `/o/` with no session shows sign-in only, no navy bar | | [ ] |
| Three sign-in buttons: white, hairline border, icons | | [ ] |
| Sign in with Google lands on dashboard or onboard | | [ ] |
| Onboard: enter name, select type, submit | | [ ] |
| Dashboard shows "Your events" with Billing button | | [ ] |
| Sign out returns to sign-in screen only | | [ ] |

## Create and go live
| Step | Phone | Desktop |
|------|-------|---------|
| + New event, enter name, date, format | | [ ] |
| Search and select a course | | [ ] |
| Select tee set | | [ ] |
| Players tab: type 4 players with handicaps | | [ ] |
| Players tab: paste 4 more | | [ ] |
| All 8 show playing handicaps | | [ ] |
| Groups tab: Auto-fill creates 2 groups | | [ ] |
| Move a player between groups | | [ ] |
| Go live tab: price shows £9.99 + 99p x players | | [ ] |
| Go live and pay: Stripe checkout opens | | [ ] |
| Complete test payment (4242 4242 4242 4242) | | [ ] |
| Return to dashboard, event shows "live" badge | | [ ] |

## Scoring (phone)
| Step | Phone | Desktop |
|------|-------|---------|
| Open find-your-name link, tap a name | [ ] | |
| Scoring screen fits viewport, no scroll | [ ] | |
| Tap numpad to score hole 1, save | [ ] | |
| Score 3 holes for group | [ ] | |
| Leaderboard tab shows points | [ ] | |
| Hand over scorer: nominate another player | [ ] | |
| Non-scorer phone sees scores read-only | [ ] | |

## Guards and offline
| Step | Phone | Desktop |
|------|-------|---------|
| High score (9 on par 3): bottom sheet "Sure?" | [ ] | |
| Aeroplane mode: score a hole | [ ] | |
| Amber bar appears "waiting for signal" | [ ] | |
| Turn signal back on: bar clears, score saves | [ ] | |

## Organiser live view
| Step | Phone | Desktop |
|------|-------|---------|
| Go live tab: group status dots (green/amber/red) | | [ ] |
| Leaderboard shows entries | | [ ] |
| Invite link + QR code displayed | | [ ] |

## Finish and results
| Step | Phone | Desktop |
|------|-------|---------|
| Finish event button works | | [ ] |
| Results page loads at `/r/<org>/<event>` | | [ ] |
| OG image renders (share preview) | [ ] | [ ] |
| WhatsApp share button works | [ ] | |
| "Run it again" clones the event | | [ ] |

## Billing
| Step | Phone | Desktop |
|------|-------|---------|
| Billing screen shows current plan | | [ ] |
| Monthly/Annual toggle updates price | | [ ] |
| Test mode banner shows on all pages | [ ] | [ ] |

## Branding (Pro only)
| Step | Phone | Desktop |
|------|-------|---------|
| Branding page loads colour pickers | | [ ] |
| Live preview updates as colours change | | [ ] |
| Bad contrast (e.g. #888888) shows amber warning | | [ ] |
| Save branding: version appears in history | | [ ] |
| Player view top bar uses custom colour | [ ] | |
| Board header uses custom colour | | [ ] |

## Admin (superadmin only)
| Step | Phone | Desktop |
|------|-------|---------|
| Admin button visible on dashboard | | [ ] |
| Organiser list with plan and event counts | | [ ] |
| Comp modal: set comp, verify plan changes | | [ ] |
| Rebrand demo modal: change colours | | [ ] |
| Reset demo button triggers reset | | [ ] |
