# Project Ordinal v0.21 — native AR Guild Hall candidate

## Source delivered
- Added `native-ios/NativeGuildHallARView.swift`: a camera-based RealityKit miniature Guild Hall built from the player's existing authoritative guild level and specialty.
- Connected the existing Town Hall page to an optional **Explore your Guild Hall in AR** action on supported iPhones.
- Level 1–5 visibly adds hall size, wings, towers, and a beacon. It does not grant rewards, change guild level, or bypass the server.
- The hall is local AR visualization, **not yet a network-shared persistent spatial anchor or multiplayer meeting room**.
- Kept the full solo sanctuary, story, Field, combat, and guild progression paths available without AR.
- Native version advanced to 0.21.0; server remains on the deployed v0.20 branch until separately updated.

## Verification status
Source has been committed to GitHub and the native compile workflow is configured to build an unsigned arm64 iPhone IPA on a macOS runner. Do not claim the v0.21 compile, physical installation, AR tracking, or multiplayer spatial sync passed until a successful run and device test are recorded.

## Test from Windows 11 with iPhone 15
1. Open the latest successful **Native iOS Compile Gate** workflow in the repository Actions tab.
2. Download the **ProjectOrdinal-iPhone-unsigned** artifact. Confirm the build commit inside BUILD-COMMIT.txt corresponds to v0.21 or newer. If it is an older commit, that artifact does **not** contain the AR Guild Hall.
3. Follow `native-ios/FREE-WINDOWS-INSTALL.md` to personally sign the unsigned IPA using AltStore Classic and AltServer.
4. Open the app, create/recover a Wayfarer, enter Town Hall, create or join a guild, and select **Explore your Guild Hall in AR**.
5. Allow Camera access, move slowly in a clear, well-lit space, and check the miniature hall appears about 1.25m ahead. Compare Level 1 and higher-level guild hall visuals where possible.
6. Close AR and verify ordinary guild actions, solo missions, combat and Field remain usable. Denied Camera should not block standard play.
7. Log failures, crashes, tracking drift, excessive battery use, and unsupported device behavior. Do not play while driving or in hazardous areas.

## Still required for a full cross-platform AR MMO
Native Android app and ARCore parity, shared spatial AR anchors, curated safe public POIs, richer biome-aware encounters, multiplayer raids/parties, true 3D creature animations/occlusion, guild building interactions and cross-device physical acceptance. These are not represented as complete by the v0.21 candidate.
