# Project Ordinal — Windows + iPhone Development Path

The project does not require the developer to own a Mac during the current build phase.

## Current workflow
Windows 10 -> GitHub repository -> GitHub Actions macOS runner -> XcodeGen -> Xcode compile gate.

The iPhone remains the physical AR/TestFlight target. The production Node/Postgres server remains authoritative.

## Phase A — no paid Apple membership
- Author Swift/SwiftUI/RealityKit/ARKit source in GitHub.
- Generate the Xcode project from project.yml on a hosted macOS runner.
- Compile against the iOS Simulator SDK with code signing disabled.
- Keep the currently deployed browser build available for real-device gameplay and camera UX testing.
- Do not spend money yet.

## Phase B — physical iPhone / TestFlight
Requires Apple Developer Program distribution credentials.
- Enroll using the Apple Developer app on the iPhone if desired.
- Create the App ID / App Store Connect record.
- Store signing material and App Store Connect API credentials only as encrypted CI secrets; never commit them.
- Build an archive on a hosted macOS runner.
- Sign/export the IPA.
- Upload to App Store Connect.
- Install through TestFlight on the iPhone 15.

## Security rules
Never commit:
- Apple ID password
- app-specific password
- signing certificate private key
- .p12 password
- App Store Connect private key
- recovery codes

## Physical AR validation
A cloud Mac can compile ARKit code but cannot validate the real camera/world-tracking experience. TestFlight on the physical iPhone is the device validation loop once distribution signing is configured.
