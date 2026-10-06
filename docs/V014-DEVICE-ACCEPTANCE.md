# v0.14 phone acceptance

Status: server/community/exchange/arena automated tests pass. Physical iPhone and production PostgreSQL restart checks remain pending. Use this checklist after deploying v0.14 and obtaining a signed native build.

## Deployment check

Open https://project-ordinal-alpha.onrender.com/health and verify version is 0.14.0 and storage is postgres. Refresh the PWA so the Live Arena 0.14 build replaces the older cache.

## Live PvP — two phones or two browser devices

1. Both players finish any encounter/loot choice and open Guild → Live Player Duel (native: Town Hall → Live player duel).
2. Player A creates an invitation and shares it privately. Player B accepts the code. Characters must be within three levels.
3. Check both screens show the same opposing health and alternate turns. Attack, guard, evade and build enough Focus to use a skill.
4. Confirm duplicate/out-of-turn taps do not apply another move. Complete a knockout; verify one win/loss and unchanged Field health.
5. Start another duel and allow one turn to expire: the idle player's opponent wins once. Closing the screen does not cancel an active duel; reopen or forfeit before returning to Field actions.
6. Test invitation cancellation, reconnect on a second session, and an interruption to connectivity. Polling after reconnect must recover server state without another reward.

## Trading and funded work

1. List an unequipped relic. It leaves the seller's inventory. Buy it on another account; check buyer debit, seller credit and transfer history. Reconnect the seller to verify the credit survives.
2. Cancel a second listing; the relic returns exactly once.
3. Fund a hunting contract and accept it on another account. Existing kills must not count. Complete the new target, claim once, and verify the posted reward transfers.
4. Cancel an unaccepted contract and check the refund; accepted work must be abandoned before the author can cancel.
5. After successful tests, restart the service and verify inventory, gold, arena records and open listings/contracts persist. Do not use production accounts for deliberate destructive database tests.

## Native AR — physical iPhone

1. First play the standard Field with camera denied. Tap Veil; check the denial instruction appears and standard play remains available.
2. Enable the app's Camera permission in iPhone Settings, reopen Veil in a well-lit safe area and move slowly until tracking is ready.
3. Tap a world contact. Move the phone around it; it should remain in the same world position through ordinary Field state updates. Collecting it should remove its anchor.
4. Enter an AR encounter and test tap/hold/swipe combat. Confirm health/loot follow the shared server rules.
5. Cover the camera or interrupt the session. Verify the status explains the problem and AR reaction actions pause. Resume tracking or choose Use standard combat.
6. Background and resume the app. Verify no local idle combat action fires while inactive, and tracking can recover without losing character state.
7. Close Veil and check the camera indicator stops. Check transit lockout, reconnect, heat/battery behavior and comfortable readable touch controls.

Browser Veil Lens provides camera overlays; native ARKit provides world tracking. A simulator or unsigned cloud compile cannot validate real camera placement or provide a signed install.
