# Real-world AR MMO requirements

Owner requested this complete scope on October 8, 2026. This ledger describes implementation rather than counting mock interfaces as complete.

| Requirement | Existing foundation | Work still required |
|---|---|---|
| Real biome spawns | Coarse regions, native map/park lookup | Verified desert, vegetation, water and coastal classifications; server-owned elemental encounters/materials |
| Local weather/time | Local Open-Meteo regional model integration, cache, geographic timezone, stale/unavailable handling, Arcanist rain conduction; live provider sample returns HTTP 200 | Physical acceptance, authored local-time night bosses and elemental spell roster |
| Structural POI hubs | Nearby park contacts | Curated public-access locations, durable hub IDs, dungeon/market/city roles, shared placements |
| Spatial occlusion | ARKit detected surfaces | Capability-gated depth/segmentation, scene occlusion and animated 3D creatures; physical tests |
| Action combat | Native aim/hold and phone-motion combat | Spell gestures, aimed ranged attacks, measured physical response; accessible alternatives |
| Nearby shared raids | Shared regional state; private turn-based PvP | Verified presence, shared spatial coordinates/anchors, authoritative raid encounter, roles and reconnect protection |
| Regional economy | Escrow market and funded contracts | Biome-specific resources and crafting; scarcity and economy balancing |
| Passive progression | Local companion implementation: level-2 Mossling, two-hour server-timed expedition, collect tonic + 12 gold | Physical acceptance, wider pet roster/resource economy and balancing |
| Territorial warfare | Guilds, alliances, roles and Hall upgrades | Real geographic territory definitions, contest rules and visit rewards |
| Transit protection | Native GPS rapid-travel combat pause; local threshold now 15 mph | Physical verification, browser equivalent, complete asynchronous transit experience and server coordination |
| Safe spawning | Park lookup and range checks | Public-access restrictions, hazard/road exclusions, curated safe boundaries and reporting; no absolute safety guarantee |
| Low-power play | 30fps effects, hidden-app pause, Reduce Motion | User-selectable saver, native background exploration/notification permissions, event vibrations and measured battery/data usage |

## Companion rules

Only one expedition can run at a time. The server starts the timer and validates collection; client clock changes cannot shorten it. Closing the app does not cancel it. Collection awards one tonic and 12 gold once, and requires tonic capacity. No timers need to run in a server worker: the saved return timestamp establishes eligibility when the player returns. Existing character persistence stores the companion with the character; temporary memory storage remains temporary. Rewards are sanctuary supplies, not geographically verified resources.

Native speed measurements remain on-device. The threshold adjustment does not establish that combat is safe in every real-world circumstance. GPS uncertainty, background suspension and browser behavior need separate acceptance.

## Regional weather

Open-Meteo receives 0.1-degree regional sample coordinates derived from existing coarse region IDs, not exact GPS. The server requests current modeled rain and day/night data with the provider's geographic timezone. Reads queue at most four external requests; requests time out after four seconds. Cache refresh is every 15 minutes, with a 60-second failure backoff and bounded cache. Bonuses expire when modeled observations or cache age exceed limits. Unavailable/demo locations receive no bonus. Rain adds 10% to Arcanist Rift Spark damage in world combat; recorded Echo duels and live PvP do not gain this modifier. This is regional weather model data, not a guarantee of rain at the player's exact position, and is not biome classification. Set ORDINAL_WEATHER=off to disable requests. Provider terms and capacity must be reviewed before commercial release; no paid subscription is created. API reference: https://open-meteo.com/en/docs .
