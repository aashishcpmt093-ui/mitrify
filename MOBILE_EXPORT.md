# Mobile export (Capacitor)

This project can ship as a native Android/iOS app. NavBharatAI generated the Capacitor **wrapper config**
(`capacitor.config.ts`) that packages your built web app (`dist/`) as a native app id `com.navbharat.mitrify`.

## One-time setup
1. Add the dependencies + scripts reported by the tool to `package.json`.
2. `npm install`
3. Build your web app: `npm run build` (produces `dist/`).
4. Add the Android platform: `npx cap add android` (and `npx cap add ios` on a Mac).

## Each release
1. `npm run build`  — rebuild the web assets
2. `npx cap sync`  — copy them into the native project
3. Open the native IDE: `npx cap open android` (Android Studio) / `npx cap open ios` (Xcode)

## Producing the installable binary (needs a build runner — NOT done here)
A signed **.apk/.aab** (Android) needs the Android SDK + Gradle and **your own signing keystore**; an **.ipa**
(iOS) needs macOS + Xcode + an Apple signing identity. NavBharatAI generates the wrapper, not the signed
binary — run `./gradlew bundleRelease` (Android) or Xcode Archive (iOS) on a machine/CI runner that has the
native toolchain and your keystore. Never commit the keystore.
