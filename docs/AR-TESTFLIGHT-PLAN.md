# Project Ordinal — Native + AR TestFlight Plan

## Principle
AR is an optional immersion layer, never a requirement to progress. Field, story, combat, loot, social systems and world consequences must remain fully playable without opening the camera.

## Preserve
The existing Node/Postgres world server remains authoritative for:
- identity and progression
- personal Story Threads
- Callings and contracts
- field-node eligibility
- combat outcomes and loot
- region state and history
- multiplayer/presence

The native client must consume the same API rather than creating a second game state.

## Native milestone before AR
1. Build an iOS client shell that authenticates against the existing server.
2. Reproduce Field, Nearby, combat, story and inventory natively.
3. Add secure location permissions and coarse-location world lookup.
4. Ship internal TestFlight builds and verify persistence, battery use, reconnects and movement handling.
5. Only then enable the AR module for a small tester group.

## AR module
Use ARKit + RealityKit on supported iPhones.

First AR vertical slice:
- Player taps an AR-capable Field signal.
- Camera opens only after explicit player action.
- Local plane/world tracking establishes a safe nearby placement surface.
- Server supplies encounter identity/state; the phone supplies only local visual placement.
- Creature/distortion appears in the environment.
- Player can inspect/approach it, but combat remains tap/gesture accessible without requiring unsafe movement.
- Outcome is posted to the same authoritative combat/world API.
- Leaving AR returns immediately to the normal Field.

Later:
- portals/rifts
- creature scale and occlusion
- environmental Veil corruption
- collectible relic inspection
- cooperative AR encounters
- location-specific world-event presentation
- spatial audio and haptics

## Safety / privacy
- Never persist exact home coordinates.
- Never require walking into roads, private property, restricted areas or dangerous terrain.
- AR encounters should anchor within the user's immediate safe camera space after activation rather than demanding travel to a centimeter-precise GPS point.
- Movement/speed safety rules remain active.
- Camera permission is requested only when the user invokes AR.
- Unsupported devices simply omit AR controls; no progression is lost.

## Testing
Test AR on physical iPhones through Xcode and TestFlight. Cover:
- bright/dark lighting
- small and large rooms
- outdoors
- interrupted AR sessions
- camera permission denied
- unsupported configurations
- low battery / thermal pressure
- weak network
- app background/resume
- walking/transit lockout
- server reconnect during encounter

## Rule
Do not make AR the game's gimmick. Project Ordinal must already be worth playing without AR; AR should make rare moments feel impossible in a normal mobile MMO.
