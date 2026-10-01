# Project Ordinal — Native iOS Bridge

This folder is the first native-client bridge for Project Ordinal. It is intentionally separate from the browser client and keeps the existing Node/Postgres world server authoritative.

## Native milestone
1. Create an iOS SwiftUI app in Xcode.
2. Add the Swift files in this folder to the app target.
3. Add `NSCameraUsageDescription` and `NSLocationWhenInUseUsageDescription` to the target Info settings.
4. Keep AR optional. The standard Field remains a complete way to play.
5. Test on a physical supported iPhone; AR world tracking is not treated as a simulator feature.
6. Use the existing production API for identity, region state, encounters, combat, loot, ranking and persistence.

## Architecture
- **OrdinalAPI.swift** — talks to the existing authoritative world server.
- **OrdinalARView.swift** — owns RealityKit/ARKit world tracking and local visual anchors.
- **OrdinalNativeApp.swift** — minimal SwiftUI shell proving the bridge.

The native client must never make combat rewards or progression authoritative locally. AR decides presentation and local placement; the server decides game state.

## Safety / privacy
- Camera starts only after an explicit AR action.
- Check AR support before presenting AR-only controls.
- Exact home coordinates are not persisted by this client.
- AR is never required for progression.
- Pause interaction-heavy gameplay during vehicle/transit state.
- Recover cleanly from denied camera/location permission and interrupted AR sessions.
