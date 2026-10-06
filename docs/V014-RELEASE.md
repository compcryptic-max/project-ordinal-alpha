# v0.14 Live Arena

Implemented in browser/PWA and native iPhone screens:
- Private synchronous turn-based PvP between two real consenting players within three levels. Server-validated moves, health, focus, stamina, guard/evade, skill, replay revisions, 45-second turn deadlines, forfeit and win/loss/draw records. Field health and currency are preserved.
- Wayfall Exchange: escrow listings, single atomic purchase, seller credit, cancellation return, transfer history and limited-relic custody.
- Player-funded contracts: upfront reward escrow, hunt/discovery/field targets, new-work baseline, acceptance, payout, abandonment and unaccepted cancellation refunds.
- Native AR: explicit camera permission, stable field anchors, camera-relative fallback placement, interruption recovery, session cleanup, tracking status, combat pause while inactive/untracked and standard-combat fallback.

Validation: npm test covers HTTP routes/reconnect arena locks, community rules, concurrent moves/single sale, stale revisions, consent, brackets, guard, timeout/forfeit, escrow/payout/refund and currency conservation. Native simulator/device compilation is checked by the GitHub workflow. No physical iPhone tracking result is claimed.

Operational gates: deploy this source to Render after workspace selection; signed iPhone/TestFlight distribution requires the owner's Apple Developer and App Store Connect setup. Current world mutation coordination assumes a single Node process; do not scale horizontally before implementing shared player-state coordination. PostgreSQL transactions store exchange and arena state; production database/restart acceptance remains to be exercised after deployment.

The approved-idea ledger retains unfinished MMO depth, Android native development, authored content, governance, migrating bosses, seasons and larger economy scope.

## Verified build results

2026-10-06: native Simulator and unsigned iPhone device builds both passed for commit 1e4c033430534823c72dca158fbef5ffce82a037. Workflow: https://github.com/compcryptic-max/project-ordinal-alpha/actions/runs/37510609162. All four npm test suites passed, including complete knockouts, Focus skills and draws. See V014-DEVICE-ACCEPTANCE.md for pending physical-device and production persistence checks.

Live health was last verified as v0.12.0 with PostgreSQL connected; v0.14 source publication does not establish deployment. Render workspace selection remains pending.
