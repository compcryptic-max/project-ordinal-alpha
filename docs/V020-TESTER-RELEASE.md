# v0.20.0 tester release — October 8, 2026

## Included

Server-timed Mossling expeditions, regional modeled weather and rain conduction, persisted-progress next objectives, capped weapon reinforcement and privacy-safe bug templates. Browser Field exposes the next objective; native Journey provides first-session instructions and a manual share template. Native Field explains denied location access and home-play alternatives. Version is 0.20.0, native build 20. The app does not automatically send bug reports.

The tester artifact includes ProjectOrdinal.ipa, its SHA-256 file, TESTER-HANDOFF.md, FREE-WINDOWS-INSTALL.md and BUILD-COMMIT.txt. Windows installs the app onto an iPhone through personal signing; the game does not run natively on Windows. Official AltStore Windows guidance was checked on October 8: https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows .

## Verification

Eleven Node suites pass, covering smoke, community, exchange, live PvP, accounts, client/network lifecycle resilience, companions, weather cache/expiry, objective sequencing, reinforcement and diagnostics privacy. Browser module syntax and patch whitespace checks pass. The initial v0.20.0 cloud build 37828573734 passed Simulator/device compilation and IPA packaging; the final permission-message/source-label build 37829074303 also passed both compile targets, packaging and upload for source 21fa6319e29069b48d10817cdc4a8b9e1a1a7f3c.

Render deployment dep-db3uggnf3r2c73dl0mpg is live for browser/server source 0033c76. Health returns HTTP 200, version 0.20.0, PostgreSQL connected. The diagnostics JavaScript module returns HTTP 200 with a JavaScript content type. Deployment-window error logs contain no errors. Subsequent source changes concern native permission guidance and artifact labeling only.

## Physical acceptance remains open

No AltStore installation, physical AR tracking, motion-control response or battery-duration pass is claimed. Tester must execute TESTER-HANDOFF.md and record pass/fail/not-tested for each case. Known unfinished MMO depth remains documented in AR-MMO-REQUIREMENTS.md and PLAYABILITY-ROADMAP.md.

## Verified download

https://github.com/compcryptic-max/project-ordinal-alpha/actions/runs/37829074303/artifacts/11572419410

Artifact: ProjectOrdinal-iPhone-unsigned, 6,961,839 bytes. Outer artifact ZIP SHA-256: 98e52428dda2eb3526f4bf00580d576ea5f58b0a9ed8ebe509a351eebd6979c5. The included IPA checksum concerns the IPA itself, not this outer ZIP. CI validates device platform, arm64 executable and package contents; no independent local download/inspection or physical installation is claimed.
