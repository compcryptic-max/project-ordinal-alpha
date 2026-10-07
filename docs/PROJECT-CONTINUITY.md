# Project Ordinal continuity

Updated 2026-10-06. This records recovered decisions, not a claim that every prior message was recovered.

## Camera presentation correction — 2026-10-07

The owner rejected the live browser Veil screenshot. Audit confirmed hashed screen positions, a fixed compass and camera-overlay icons; this is not spatial AR. Browser fallback now labels itself Camera Preview, puts interactions in an orderly HUD panel, and removes the false compass, rating, contact count and F-labels. This correction is local and not deployed yet. It does not implement spatial browser AR.

Native ARKit has world anchors but currently renders placeholder spheres. Real environment-integrated encounter visuals, tracked physical-device placement and native AR combat presentation remain unfinished. Compilation is not evidence of a completed AR experience. Do not present either client as the intended finished AR gameplay.

## Verified source baseline

- Repository: https://github.com/compcryptic-max/project-ordinal-alpha
- Recovered HEAD: 6dd71b6; package version 0.12.0, Living Threads.
- v0.11 Active Field is an earlier milestone, not the current baseline.
- Browser client, authoritative Node/Postgres server, Swift iOS client, and cloud iOS compile workflow are present.
- Signed TestFlight distribution and physical AR validation are not established by source inspection.

## Binding direction

- Build a deep MMO for iPhone and Android with broad AR, exploration, replayability, and community.
- Solo play is a complete primary path.
- Keep a true guild system with a Town Hall.
- Simplicity mainly concerns player/item identification and serial-number clutter; preserve gameplay depth.
- Keep IDs and item history low-profile or absent from ordinary gameplay UI.
- Do not use nearby-player counters, countdown raid feeds, community progress meters, or group-finder clutter as the core experience.
- Select additional features for their contribution to exploration, AR, replayability, and community; avoid needless UI complexity.
- Native clients share the authoritative world server; AR remains optional for progression.

## Recovered approved design scope

Ordinal Identity; Living Location World; World Memory; Personal Story Engine; Nemesis 2.0; Hidden World Layers; Organic Classes; Globally Limited Items; Item History; Remote Network; Dynamic Contracts; NPC Memory; Organizations; Player Bounties; Regional Influence; Discoverable World Bosses; Global Mysteries; Ordinal Events; Consequential Defeat; Permanent World Evolution.

Approval is design scope, not evidence that each system is implemented. Apply the later identification simplicity constraint to identity and item-history features.

## Continue from here

Audit existing Living Threads systems before adding previously proposed v0.12 work again. Preserve Field movement, proximity gameplay, reaction combat, Rift Runs, Veil Lens, story, Callings, contracts, gear, Nemesis, and persistence. Establish the missing solo/guild/world-memory work against the actual source. Keep Android support in the platform plan; the current native folder establishes iOS only. Inspect the cloud iOS build before changing signing/distribution instructions.

## Current local milestone

v0.13 Wayfall Hall adds guild/Town Hall systems, solo sanctuary, NPC memory, item stories, a shared mystery with limited relics, and voluntary recorded-Echo bounties in browser and native iPhone clients. See APPROVED-IDEAS.md for the full coverage ledger and unfinished depth. Signed iPhone distribution and physical AR testing remain unverified.


## v0.14 Live Arena

Browser and native iPhone screens now support private live PvP: two real consenting players, ±3-level bracket, server-owned HP/Focus/stamina, attack/guard/evade/skill, 45-second turns, revision/replay rejection, timeout, forfeit and records. This is synchronous turn-based PvP; it is separate from recorded Echo encounters. Field HP is preserved.

Wayfall Exchange escrows unequipped relics, atomically credits the seller and transfers item history/limited relic custody. Funded player contracts pay only for new verified work after acceptance, with cancellation refunds before acceptance. Local mutation and reconnect serialization keeps simultaneous sessions consistent. Deployment currently assumes one Node process; horizontal scaling needs cross-instance player-state/lock handling.

Native AR now requests camera permission on explicit Veil entry, retains surviving anchors across field updates, places fallback anchors relative to the camera, reports tracking/interruption errors and cleans up sessions. AR combat pauses local reaction actions while inactive/interrupted and offers standard combat. Physical-device AR acceptance and signed installation remain required.

Verification checkpoint: 1e4c033 passes both Simulator and unsigned iPhone device compilation (run 37510609162); all four npm suites pass. Source is published on main. Live server last reports v0.12, so deployment is pending explicit selection of Comp's workspace in the Render connector. Signed installation and physical iPhone AR acceptance remain pending. Resume with deployment, phone checklist, and the unfinished depth in APPROVED-IDEAS.md; do not reimplement these v0.14 systems.

## v0.15 Quest Director

The next solo/replayability milestone adds a server-authoritative adaptive directive to Journey. It selects hunt, discovery or Field work from the player's Calling and regional conditions; records a fresh baseline; verifies progress; grants bounded rewards and changes regional threat, prosperity or order. Players may reroute once per UTC day. Browser and native iPhone share the same state and controls. This covers the approved adaptive quest-director foundation without adding public meters or making multiplayer mandatory.

## v0.16 Living Halls

Guild organizations now include Leader, Officer and Member permissions. Leaders control roles, alliances, leadership and specialization; officers can recruit and restore the Hall. Hall level 2 unlocks Pathfinders, Sentinels or Artisans, which reward different newly contributed activity. Specialty changes cost guild supplies. Browser and native iPhone share these controls. Secret organizations and deeper proposal/voting governance remain unfinished.

Verification checkpoint: commit 0d3d4bd passes all four Node suites and both native compile targets (GitHub Actions run 37513385353). The live Render health endpoint still reports v0.12.0 with PostgreSQL connected. Deployment requires explicit confirmation to use Render workspace `Comp's workspace`; signed iPhone installation and physical AR testing still require the owner's Apple Developer setup and iPhone.

## v0.17 Honest Veil and original creatures

The visual quality pass replaces generic diagrams and silhouettes with eight original monsters and four original Wayfarer class designs across browser and native screens. Live PvP now shows both fighters. The browser camera experience is explicitly labeled Camera Preview, uses a HUD list, removes fake fixed contacts and no longer opens fixed camera-overlay combat. Serial-looking `F-###` presentation is replaced by qualitative range language.

Native ARKit now uses distinct Field forms and creature textures for hostile anchors while retaining world tracking. Physical iPhone tracking, scale, orientation and touch acceptance are still required; compile success does not prove the physical AR experience. See V017-RELEASE.md.

Verification checkpoint: commit d6ef543 passes the GitHub Actions Simulator and unsigned physical-iPhone compile targets in run 37632344174. All four Node suites pass locally. The v0.17 source is on main; the live Render service still requires deployment before the browser receives these changes.
