# Project Ordinal — Windows and iPhone testing

You can develop and personally test this project using Windows and a free Apple account. A paid Apple Developer Program membership is needed for the TestFlight distribution route, not for the personal signing route described below.

## Free personal testing

GitHub Actions compiles the simulator and arm64 iPhone app on a macOS runner. It packages the unsigned device app as `ProjectOrdinal.ipa` in the `ProjectOrdinal-iPhone-unsigned` artifact. On Windows, AltServer/AltStore Classic signs that IPA using your own account and installs it on your connected iPhone.

Follow [the installation guide](FREE-WINDOWS-INSTALL.md). Free-account sideloaded apps expire after seven days and need refreshing. Keep account credentials in the signing software on your own computer; never send them to this project or chat.

The browser build remains available, but camera preview is not native spatial AR. Native AR requires installing the native app.

## Optional TestFlight distribution

After choosing paid distribution, configure the App ID and App Store Connect record, store signing/API material only in encrypted CI secrets, archive/sign/export on the hosted macOS runner, and upload to TestFlight. No enrollment, purchase or distribution has been performed as part of the free testing route.

## Physical acceptance

Cloud compilation cannot verify camera tracking, real surface anchoring or phone gestures. After installing on the iPhone, use the physical checklist in `../docs/SPATIAL-REPAIR-REVIEW.md`. Report installation errors without credentials, and tracking or gesture behavior observed on the phone.
