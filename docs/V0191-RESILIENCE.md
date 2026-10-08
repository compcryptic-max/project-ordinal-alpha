# v0.19.1 — reconnect and spatial reliability

Prepared locally on October 8, 2026. This checkpoint is not a deployed release or a newly compiled iPhone package.

## Implemented

- Preserve saved browser/native Wayfarer identities on connection errors. Remove them only when the server explicitly confirms that the identity is missing. Add reconnect controls.
- Bound browser requests to 15 seconds, native request/resource timeouts to 15/25 seconds, and initial GPS acquisition to 12 seconds. Never automatically retry failed game writes.
- Resolve all concurrent GPS callers rather than overwriting a single continuation. Expire precise/coarse fixes after 15 seconds, clear them on suspension, and ignore late callbacks after monitoring stops.
- Keep active GPS updates while stationary, so aiming at a contact does not intentionally stop location delivery through a distance filter.
- Cancel superseded park searches, ignore their late results, prune collected contacts without requiring accurate GPS, reject missing park coordinates, and filter contacts against the latest position.
- Update map markers when their coordinates or labels change. Add an accessible 44-point map-recenter control that does not override intentional panning during ordinary refreshes.
- Prevent stale world, Hall and live-PvP reads from replacing newer state. Serialize background polls and stop arena polling in hidden tabs.
- Pause uncertain combat after a failed response until a read confirms the server state. Native standard combat now pauses while inactive, in rapid travel, busy or resynchronizing, matching the AR lifecycle checks.
- Avoid caching failed HTTP responses over working app files; provide an explicit offline fallback and include the new client module in the cached app shell.
- Cap decorative canvas effects at 30 frames/second, stop hidden-app effects, and render a static frame with Reduce Motion. Combat timing remains gameplay-controlled; no battery-life measurement is claimed.

## Verification

All six Node suites pass: smoke, community, exchange, live arena, accounts and client resilience. The new suite exercises actual browser functions with controlled delayed world/Hall/PvP responses, uncertain-combat pause/resync, network timeouts, saved-key retention, cache failures, hidden-app effects and Reduce Motion. The local HTTP test also verifies that the new imported client module is served.

All 22 native Swift files parse without syntax errors. There is no Apple SDK in the local environment: parsing is not Xcode type checking, and native runtime behavior is not established by these tests. A fresh cloud iOS build and physical acceptance are required before replacing the previous successful IPA.

## Remaining gates

The prior downloadable IPA remains the one from GitHub run 37807283203 (commit abc400f). This local checkpoint has not been publicly pushed or deployed. Publishing it to the public repository needs approval under the owner's no-public-publication-without-authorization instruction. After approval, run the compile/package gate, fix any type/build failures and produce an updated IPA. Physical iPhone AR acceptance remains pending separately; Windows/AltStore setup can wait while development continues.
