# Project Ordinal: free personal testing from Windows

The iPhone testing artifact contains `ProjectOrdinal.ipa` and its SHA-256 checksum. It is an unsigned device build, not a simulator app. Your own Apple account signs it during installation. No Apple password or certificate belongs in this repository or chat.

## Install

1. On your Windows PC, open https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows and follow the current guide for **AltStore Classic**. Classic is the Windows/AltServer route; AltStore PAL is a different product.
2. Install the Apple iTunes/iCloud components specified in that guide, then AltServer from https://altstore.io/ .
3. Connect the iPhone with a data cable, unlock it and trust the computer. Enable iTunes Wi-Fi sync.
4. In the AltServer tray menu, choose Install AltStore and select the iPhone. Sign in with your Apple account inside AltServer; do not send credentials to the game developer or this chat.
5. On the iPhone, trust the developer profile in Settings > General > VPN & Device Management. Enable Developer Mode in Settings > Privacy & Security if requested and complete its restart/confirmation.
6. Download the latest successful build artifact named `ProjectOrdinal-iPhone-unsigned` from the repository's Native iOS Compile Gate run. GitHub may require signing in to download artifacts. Extract its ZIP, and transfer `ProjectOrdinal.ipa` to Files on the iPhone.
7. Keep AltServer running and the phone connected by USB or on the same Wi-Fi. In AltStore Classic, use My Apps > + and select `ProjectOrdinal.ipa`.
8. Open Project Ordinal, create a test account and permit Camera when opening Veil. Local Veil works without traveling. Landmark Veil depends on location quality and proximity to a map contact.

## Free-account limits

AltStore documents seven-day expiry and a three-active-app limit. Refresh before expiry with AltServer available. AltStore itself uses an app slot. See https://faq.altstore.io/altstore-classic/your-altstore and https://faq.altstore.io/altstore-classic/altserver .

## What to report

If installation fails, send the exact error text or a screenshot that excludes credentials. Once it opens, test aim-and-hold collection and motion combat; report tracking drift or gestures that trigger unexpectedly. Simulator/device compilation and IPA packaging do not prove AltStore installation or physical AR behavior.
