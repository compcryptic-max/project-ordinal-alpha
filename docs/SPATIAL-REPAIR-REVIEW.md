# Spatial repair review — 2026-10-07

## Verified baseline

GitHub run 37639097363 compiled commit 0c88d9337b6a67a7bd44594ab85094b001906067 successfully for simulator and unsigned iPhone on October 7. That proves compilation of the previous v0.19 source, not physical AR quality.

## Published changes (commit e8fc2f9, October 8)

- Replace random coordinates with nearby Apple Maps park results within 1.5 km; stable per-session contact assignments share one store between Field and Veil.
- Landmark Veil checks the same proximity range as Field. Physical arrival gives a haptic cue; discovery uses aiming and holding on the detected surface.
- Local Veil explicitly supports camera exploration without travel or a successful park lookup.
- Aim-and-hold collects the server-owned contact directly rather than opening a touch-only minigame.
- Place contacts and monsters only on detected horizontal geometry; retry scanning until placement succeeds. No camera-relative fallback masquerades as surface placement.
- Remove the second screen-fixed combat monster. Attacks require aim on the anchored creature; translation still drives dodge and guard.
- Pause reaction timers during tracking loss, app inactivity, vehicle travel and a pending server action.
- Start location monitoring after account completion even when sign-in already restored a character. Reject stale fixes and clear coordinates when permission is revoked.
- Preserve map panning rather than forcing follow mode on every state update.
- Remove unused synthetic terrain, fake player positions, joystick movement and map-touch interaction code.
- Show API error messages on native account/game requests.

## Validation

All five Node suites pass. All native Swift files parse without syntax errors using tree-sitter-swift. GitHub Actions run 37807283203 passed simulator compilation, unsigned arm64 iPhone compilation, IPA packaging and artifact upload for commit abc400f84c57c98ca83ee1928d17127d0c97a7e8 on October 8. The earlier lipo argument-order failure is fixed. The packager checks the iPhoneOS platform, arm64 executable, ZIP integrity and required bundle files and writes a SHA-256 checksum. Local fixtures cover structure, symlinks, checksum, simulator rejection and corrected command ordering.

Download: https://github.com/compcryptic-max/project-ordinal-alpha/actions/runs/37807283203/artifacts/11562884664 . Artifact name: `ProjectOrdinal-iPhone-unsigned`; IPA size: 6,874,352 bytes. The ZIP expires January 6, 2027 and can be rebuilt. Downloading the connector's temporary file URL for additional local inspection returned HTTP 403; no claim of an independent local artifact inspection is made. AltStore installation and physical camera/motion behavior remain unverified.


## Remaining limits

- Apple Maps park results are locations, not verified entrances, hours, ownership, or safe pedestrian routes. They do not guarantee accessibility. No arbitrary pin is used as a fallback.
- Landmark assignments are local to this client session. Shared exact-world placement across players is not implemented.
- Creatures currently use original illustrated textures on world-anchored planes; animated rigged 3D creatures remain unfinished.
- AR local surface tracking does not identify arbitrary objects such as benches, doors, or trees.
- MapKit receives location for maps/search. The Ordinal game server receives only rounded coarse-region coordinates; previous claims that exact coordinates never leave the phone were too broad.
- GPS/AR inputs are client-side interaction gates, not proof of physical location for competitive rewards.

## Physical acceptance checks

1. Create/sign in with test details; verify map position updates without backgrounding first.
2. Pan the map; check it remains where dragged after a server refresh.
3. Find a nearby park marker, then approach only via public paths. Confirm distance decreases and arrival haptic occurs.
4. Open Landmark Veil while distant: no remote contacts may appear.
5. Open Local Veil indoors: no floating contact may appear before the ground is detected.
6. Aim for 1.15 seconds at a contact: collect without a screen tap; verify the contact disappears and reward persists after reconnect.
7. Engage a hostile, scan the ground and move the phone: one creature remains anchored in space.
8. Thrust with aim off the creature: no strike. Aim at it and make a small forward motion: one strike. Move sideways/raise to dodge/guard.
9. Cover camera, background app, interrupt camera and resume: reaction timer pauses; placement/tracking recovers.
10. Deny camera or location: standard play remains available; errors explain the blocked capability.
