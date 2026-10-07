# v0.17 — Honest Veil and original creatures

This pass improves systems already in the game and removes presentation that implied capabilities the browser did not have.

## Player-facing changes

- Replaces generic enemy diagrams with eight original creature designs: Pale Hound, Veil Stalker, Hollow Marauder, Glass Warden, Mirehorn, Ash Revenant, Choirless Knight and Riftweaver.
- Replaces the generic player silhouette with unique Vanguard, Ranger, Arcanist and Rogue designs.
- Adds a custom fractured compass-and-veil app icon for iPhone and the installable browser game.
- Uses the new art in browser onboarding, Field exploration, encounters, combat and live PvP.
- Uses the same character and creature identity across native onboarding, Field, encounters, standard combat, AR combat and live PvP.
- Replaces numeric `F-###` presentation with Close, Nearby and Distant range language.

## Camera and AR correction

- Browser Veil Lens is explicitly a Camera Preview. Interactions are in a HUD panel and no longer appear as fake room-anchored contacts.
- Browser camera preview no longer transitions into a fixed camera-overlay combat scene.
- Native ARKit remains the spatial implementation. Field contacts now have distinct cache, resource and memory forms, while hostile and combat anchors use the new creature art.
- Native spatial placement still requires validation on a physical iPhone before it can be called finished.

## Validation

- All four Node test suites pass after the presentation and range-label changes.
- JavaScript syntax and repository diff checks pass.
- Native Simulator and unsigned device compilation passed in GitHub Actions run 37632344174.

The generated art was produced specifically for Project Ordinal as transparent, full-body dark-fantasy game assets, then cropped, optimized and installed into the browser and native asset catalogs.
