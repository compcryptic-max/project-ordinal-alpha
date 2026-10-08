# v0.19.1 — reconnect and spatial reliability

Published and deployed on October 8, 2026. Source batch: cbd0b3b; health-label correction: 33b1788. The owner authorized publication by instructing continuation after the reviewed batch's publication gate.

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

All 22 native Swift files parse without syntax errors. GitHub run 37820736151 also passed Apple-SDK compilation for both Simulator and unsigned physical iPhone, IPA packaging and artifact upload. Artifact 11569900005 (`ProjectOrdinal-iPhone-unsigned`) replaces the earlier package for personal testing: https://github.com/compcryptic-max/project-ordinal-alpha/actions/runs/37820736151/artifacts/11569900005 . The outer artifact ZIP SHA-256 is 64fb7a961282c9f292a9b186737fd02c2301107ec1ff2b02c6626e3063941f68. CI verifies device platform, arm64 executable and IPA contents. Compilation does not establish physical runtime behavior.

Render deployment dep-db3tljc9v7es738ccul0 is live for 33b1788 on the existing free service. The browser client module returns HTTP 200 with a JavaScript content type. PostgreSQL is connected, and the deployment-window error-log query returns no errors.

## Remaining gates

Physical iPhone installation and AR acceptance remain pending separately; Windows/AltStore setup can wait while development continues. Use native-ios/FREE-WINDOWS-INSTALL.md with the new artifact above. The IPA is unsigned and requires personal signing. Shared exact landmark placements, rigged 3D monsters and the remaining depth in APPROVED-IDEAS.md are still unfinished; this release does not claim those systems complete.
