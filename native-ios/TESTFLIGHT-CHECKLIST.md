# Project Ordinal — TestFlight Gate

Current target: native iPhone vertical slice that connects to the existing world server and adds true AR world anchoring.

## Required human-side gate
- A macOS/Xcode build environment: the repository includes a cloud compile workflow; local Mac access is optional when a cloud signing/distribution workflow is configured.
- Apple ID signed into Xcode.
- Apple Developer Program membership for TestFlight distribution. Direct personal-device testing through Xcode can use a free Apple Account/Personal Team; membership is not required for that route (https://developer.apple.com/support/compare-memberships/).
- A physical ARKit-capable iPhone for camera/world-tracking validation.
- An App Store Connect app record and unique bundle identifier.

## First Xcode project
- Platform: iOS
- Interface: SwiftUI
- Language: Swift
- Product name: Project Ordinal
- Bundle identifier: choose an identifier controlled by the developer account.
- Add the Swift files from this folder to the app target.
- Add Camera usage description: "Project Ordinal uses the camera only when you open the Veil Lens to place game encounters in your surroundings."
- Add Location When In Use description: "Project Ordinal uses location for real map position and Apple Maps landmark search. The game server receives only rounded coarse coordinates."

## Physical-device acceptance gate
1. Standard Field launches with camera permission denied.
2. World server health connects over HTTPS.
3. Native Veil opens only after an explicit tap.
4. AR support is checked before the AR control is offered.
5. Horizontal/vertical surfaces can establish an anchor.
6. Prototype signal remains fixed in world space as the phone moves.
7. Session interruption recovers without losing server-side character state.
8. Backgrounding the app does not resolve combat against the player.
9. Transit/vehicle state suppresses interaction-heavy gameplay.
10. No exact home coordinate is written to persistent player data.

## TestFlight gate
- Archive a Release build in Xcode.
- Resolve signing/provisioning errors before upload.
- Upload the build to App Store Connect.
- Fill TestFlight beta information and feedback contact.
- Start with internal testers.
- Validate camera permission, AR tracking, reconnect, battery/thermal behavior, and server persistence before external testing.
