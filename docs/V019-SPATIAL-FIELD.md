# Project Ordinal v0.19 — Spatial Field

## What changed

- The native Field now uses Apple Maps and follows the player's real position and heading.
- Server Field contacts receive stable coordinates near the player and appear against real streets.
- Walking into range activates a contact automatically; the joystick is no longer the primary movement system.
- Exact GPS coordinates stay on the iPhone. The server still receives only a coordinate rounded to roughly one kilometer for region selection.
- Veil contacts re-anchor after ARKit detects a real horizontal or vertical surface.
- A center reticle locks an AR contact after the player aims at it for 1.15 seconds, so tapping is optional.
- AR combat recognizes three physical phone motions: forward thrust to strike, sideways motion to dodge, and upward motion to guard.
- Existing buttons and standard combat remain available as accessibility and tracking fallbacks.

## Current physical-device limit

The iPhone 15 Plus can map floors and walls with ARKit, but it has no LiDAR scanner. It can place game content against detected surfaces; reliable automatic identification of arbitrary real objects will require a later on-device vision model and physical-device testing.

## Next spatial milestones

1. Snap contacts to safe public walkable areas and approved points of interest.
2. Persist shared landmark anchors on the server at coarse, privacy-preserving resolution.
3. Add route-aware spawning so contacts avoid roads, private property, and inaccessible terrain.
4. Calibrate motion thresholds from physical TestFlight sessions.
