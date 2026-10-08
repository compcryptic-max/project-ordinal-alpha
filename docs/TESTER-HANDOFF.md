# Project Ordinal 0.20.0 — professional tester handoff

## Purpose and requirements

Test installation, the first solo session, persistence and physical AR usability. This is an alpha, not a finished geographic MMO. Windows is used to install the native app onto an iPhone (iOS 17+); Windows itself does not run the iPhone AR app. Use a data cable, a personal Apple account, AltServer/AltStore Classic and the official Apple components. No paid enrollment is needed for the intended personal signing route. Follow ../native-ios/FREE-WINDOWS-INSTALL.md and the current official guide linked there.

Download the release-specific unsigned IPA artifact linked in the release record. Extract the outer ZIP; compare ProjectOrdinal.ipa to the supplied SHA-256 file. On Windows PowerShell: `Get-FileHash .\ProjectOrdinal.ipa -Algorithm SHA256`. Install using AltStore's My Apps + chooser. Do not attempt to install the artifact ZIP. Credentials remain with the tester in AltServer, not in a bug report.

## Installation recovery

- Phone missing: unlock it, trust the PC, try a known data cable, confirm recognition in iTunes, and restart AltServer.
- Apple component errors: follow the official AltStore Windows troubleshooting guide rather than substituting arbitrary download sites.
- Untrusted developer/Developer Mode: complete the trust and Developer Mode steps, including required restarts.
- Signing/active-app limit: check AltStore's app slots and account limits. Do not delete other apps without preserving their data.
- Expired installation: refresh through AltServer; record whether the character remains intact. Reinstallation is not the first troubleshooting step.
- Report the exact error, failing step, Windows version, iPhone model and iOS version. Exclude Apple login details.

## Test sequence and acceptance

Record pass/fail/not-tested separately for each row. Use a new test identity, then a returning identity. Invented account information is permitted in alpha; passwords and recovery codes still authenticate.

| Area | Procedure | Expected |
|---|---|---|
| Install | Install via Windows; launch twice | App installs and opens without crash; build identifies 0.20.0 / 20 |
| Onboarding | Create account and character; sign out/recover using saved private code | Understandable stages; same character returns; no credential exposure |
| Opening | Follow Field/Journal objective; meet Keeper, investigate, fight, loot, resolve shrine, equip and trace archive | Objective follows real progress; rewards and equipment persist |
| Home/no GPS | Deny location; use Sanctuary and investigate signals | Solo path remains usable; no invented precise map contacts |
| Permissions | Deny camera; try Veil; enable permission in Settings and retry | Clear failure/fallback; no crash; camera only requested for Veil |
| Standard combat | Test attack, guard, dodge, skill, tonic and retreat; check insufficient resources | Intent readable; state/rewards consistent; no duplicate mutation |
| AR collection | In a stationary, accessible well-lit space, scan floor; aim/hold at a contact | Surface placement, readable scale, collection once; record drift/orientation |
| Motion combat | Try strike/dodge/guard separately; interrupt tracking and use standard fallback | Intentional recognition; no unexpected repeated actions; interruption pauses local reactions |
| Walking | Walk on a public pedestrian path to a contact; test poor accuracy | Actual distance/proximity agrees reasonably with phone; uncertain location pauses activation |
| Transit | Test speed protection as a passenger or with controlled location tooling; do not operate while driving | Interactions pause above threshold; report latency/hysteresis; GPS delivery limitations documented |
| Network | Disconnect during read and immediately after an action; reconnect | Identity retained; uncertain combat pauses; server state restores before further actions |
| Lifecycle | Lock screen/background mid-combat and mid-map; resume | Local timers pause; fresh GPS/authoritative state required; no stale activation |
| Persistence | Force close, reopen and recover on another session | Same XP, gold, equipped item and claimed rewards; concurrent actions cannot duplicate them |
| Companion | Reach level 2; dispatch; close app; return after two hours; collect twice | Timer survives; first claim grants one tonic/12 gold; second grants nothing |
| Crafting | Reinforce equipped weapon three times; test insufficient gold/fourth attempt | +2 power per upgrade; 25/50/75 gold; cap; failure changes nothing |
| Weather | Compare displayed regional model status; disconnect/provider unavailable | No stale rain bonus; no claim that model data is exact on-site weather |
| PvP | Two actual players create/accept invitation; move, timeout, forfeit, reconnect | Correct turns, no replay/double moves; field HP preserved |
| Battery/data | Fixed 20-minute standard exploration and 20-minute AR sessions | Record battery percentage and available data usage; temperature and FPS complaints; no assumed battery target |

Location/camera permission behavior, AltStore installation and physical motion acceptance require the tester's devices. Cloud compilation cannot establish these results. Do not mark them passed without execution.

## Bug reporting

Native: Journey → Share bug report template. Browser: Guild → How to play & tester report. These expose version and limited gameplay flags, not IDs, credentials or coordinates. Sharing is manual; no report is automatically sent.

Include title, severity, build, device/OS, numbered reproduction steps, expected/actual results, frequency and a short recording. Critical: loss of progress, duplicate rewards, installation failure or crash. High: blocked core flow or consistently broken combat/AR. Medium: unreliable interactions with a workaround. Low: cosmetic defects. Avoid recording private surroundings or recovery codes. Add the approximate scenario (indoors/outdoors, lighting, network) rather than an exact address.

## Known unfinished scope

Browser camera is a preview, not spatial AR. Native creatures use illustrated surfaces rather than rigged 3D monsters. Precise shared AR raids, biome resource generation, guaranteed hazard/private-property exclusion, friend parties/territory warfare and screen-off event alerts are not implemented. Review AR-MMO-REQUIREMENTS.md and PLAYABILITY-ROADMAP.md. Report confusing promises as bugs, but do not classify these explicitly absent features as completed systems.
