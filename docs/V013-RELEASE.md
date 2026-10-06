# v0.13 — Wayfall Hall

Guilds now have a usable home: founding, private invitations, membership, leadership transfer, shared supplies, five Town Hall restoration levels and mutually accepted alliances. Supplies come from verified solo activity, with contribution replay protection across guild changes.

The solo sanctuary supports healing, tonic crafting and archive investigations. Sera remembers past answers and changes her dialogue with trust. Relics remember acquisition and equipped victories without showing serial clutter.

The Door That Remembers is a three-layer, progression-gated investigation with a persistent shared-world opening. The first 100 solvers can claim an equippable founding relic; remaining players can still complete their own mystery.

The voluntary Echo arena lets players offer recorded echoes and challenge consenting players asynchronously within a level bracket. It preserves field health on return, creates no regional death penalty, and awards only verified victories. This is the first restricted bounty implementation; it is not live PvP.

The browser and Swift native client expose these features. Tests cover guild authority, concurrent duplicate joining, reconnect membership, alliances, contribution replay, restoration costs, mystery progression/replay/finite supply, sanctuary costs/cooldown/NPC memory and arena withdrawal. Physical-device AR acceptance and signed TestFlight distribution remain separate gates.

## Play on iPhone

1. Open https://project-ordinal-alpha.onrender.com in Safari after deployment reports v0.13.
2. Create or reconnect your Wayfarer.
3. Use Field for exploration, Gear for relics and Guild for Town Hall and your solo sanctuary.
4. To install the web app, use Safari Share → Add to Home Screen.
5. Open the Veil Lens when you want the camera layer. Browser camera presentation does not provide native ARKit anchoring.

A native installation requires a signed device build or TestFlight invitation. The repository's macOS workflow compiles unsigned simulator and device targets; it does not sign or distribute the app.
