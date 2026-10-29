# Clinic Staff (Android)

A small Capacitor app that opens only the staff page, `https://mitrify.com/?portal=staff`, full screen.
The page itself is the live website, so website updates reach the app without a new APK. Build a new
APK only when the app name, icon or address changes.

Build: GitHub → Actions → "Build Staff Android app (APK)" → Run workflow. The APK is attached to the
`staff-app` release and to the run as an artifact.

- Address and name: `capacitor.config.json`
- Icon and splash: `assets/` (icon-only, icon-foreground, icon-background, splash, splash-dark)
