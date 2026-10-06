# v0.16 Living Halls

Guild leaders can promote and demote officers. Officers receive the private recruitment invitation and may spend guild supplies on Town Hall restoration, but only the leader can control alliances, officer roles, leadership transfer and Hall specialty.

At Hall level 2, leaders can choose one visible contribution specialty:

- Pathfinders gain 2 additional supplies for each new discovery contributed.
- Sentinels gain 1 additional supply for each new hostile defeat contributed.
- Artisans gain 2 additional supplies for each newly completed contract contributed.

Changing an established specialty costs 25 guild supplies. All permissions, costs and bonuses are enforced inside the same serialized/transactional guild service used by roster and Hall state. Browser/PWA and native iPhone Town Hall screens expose the same controls without creating a separate management dashboard.

Community tests cover member permission denial, promotion, officer invitation access, specialty contribution math, officer restoration, demotion, revoked access and non-leader management rejection.

Verification: all four Node test suites passed. GitHub Actions run 37513385353 compiled both the iPhone Simulator target and the unsigned physical-iPhone target successfully for commit 0d3d4bd3f228b81c6395e33dfc35517adf4e7e7a. This does not replace signed installation or physical AR acceptance.
