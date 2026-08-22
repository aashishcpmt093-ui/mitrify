# Shipping mitrify to the app stores

NavBharatAI generated a complete build pipeline for this project. **GitHub's own runners build the real,
signed app** — you do not need Android Studio, and you do not need to own a Mac.

## Honest scope — what is automated and what only you can do

| Step | Who does it |
|---|---|
| Capacitor wrapper + build workflows | ✅ NavBharatAI (already generated) |
| Compiling and signing the real `.aab` / `.ipa` | ✅ GitHub Actions runners |
| Uploading to TestFlight | ✅ Automated (iOS workflow, `upload` checked) |
| Your signing keystore / Apple account | ⚠️ **Only you** — these are your identity and must never be shared |
| Uploading the `.aab` to Play Console | ⚠️ **You** (Google has no unattended upload without extra setup) |
| Store listing, screenshots, review submission | ⚠️ **You**, in Play Console / App Store Connect |

An app cannot be built without your own signing identity — that is Apple's and Google's rule, not a
NavBharatAI limitation. Everything that *can* be automated, is.

## 1. Add your secrets

GitHub → your repo → **Settings → Secrets and variables → Actions → New repository secret**.

## Android

### `ANDROID_KEYSTORE_BASE64`
Your app signing keystore, base64-encoded. This is your app’s permanent identity — losing it means you can never update the app again.

**Where to get it:** Create once: keytool -genkey -v -keystore release.keystore -alias app -keyalg RSA -keysize 2048 -validity 10000 — then: base64 -w0 release.keystore (Linux) / base64 -i release.keystore (macOS)

### `ANDROID_KEYSTORE_PASSWORD`
The keystore password you chose above.

**Where to get it:** The password you set when running keytool.

### `ANDROID_KEY_ALIAS`
The key alias inside the keystore (e.g. "app").

**Where to get it:** The -alias value you passed to keytool.

### `ANDROID_KEY_PASSWORD`
The key password (often the same as the keystore password).

**Where to get it:** The password you set when running keytool.

> ⚠️ **Back up your keystore file somewhere safe.** It is your app's permanent identity — if you lose it,
> Google Play will never accept an update to this app again.

## iOS (needs a paid Apple Developer account — $99/year)

### `IOS_ASC_KEY_ID`
App Store Connect API Key ID (~10 characters).

**Where to get it:** App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with the Admin role.

### `IOS_ASC_ISSUER_ID`
App Store Connect Issuer ID (a UUID — NOT the Key ID).

**Where to get it:** Shown at the top of the same App Store Connect API keys page.

### `IOS_ASC_KEY_BASE64`
The AuthKey_XXXXXX.p8 private key — paste the whole file contents (BEGIN/END lines included) or its base64.

**Where to get it:** Downloaded ONCE when you generate the API key above. Keep it safe; Apple will not let you download it again.

### `IOS_TEAM_ID`
Your Apple Developer Team ID (10 characters).

**Where to get it:** Apple Developer → Membership.

One more one-time step, all on the web: **App Store Connect → My Apps → + → New App**, using the bundle
id `com.navbharat.mitrify`, so uploads have somewhere to land.

## 2. Build it

GitHub → **Actions** tab → pick the workflow → **Run workflow**.

- **Build Android App Bundle (.aab, signed)** → produces the `release-aab` artifact. Download it and
  upload it in Play Console → your app → Production → Create new release.
- **Build iOS App (.ipa, signed)** → tick **upload** to send it straight to TestFlight. The run stays
  yellow until Apple finishes processing, so a green check means it genuinely landed in TestFlight.

## 3. Every later release

Just run the workflow again. The version/build number is stamped automatically from the run number, so
you will never hit "this version already exists" from either store.

---

# Step-by-step: getting it onto the stores

Never published an app before? These are the complete walkthroughs, including what each store costs and
how long each step really takes.

## Google Play

```
Publishing your app on the Google Play Store

Before you start: You need a Google Play developer account (about $25 / ₹2,000, paid once — no yearly fee). Expect roughly 2 hours of your own work, then 1–7 days for Google to review. You do not need any special computer — NavBharatAI builds the app for you.

1. Create a Google Play developer account
   Go to Google Play Console and sign in with the Google account you want to own the app forever. Google charges a ONE-TIME fee of about $25 (roughly ₹2,000) — there is no yearly fee. You will have to enter your name and address, and Google verifies your identity, which can take a couple of days.
   You should see: A Play Console dashboard with an "Create app" button.
   (Cost: About $25 (~₹2,000), one time, forever · Takes: A few minutes to pay; identity verification can take 1–3 days · Only you can do this)
   Link: https://play.google.com/console/signup

2. Create your signing key (your app’s permanent identity)
   A signing key is a file that proves future updates really come from you. NavBharatAI gives you the exact one-line command to create it in the SHIPPING.md file. Run it once, then keep the file safe — a password manager or a cloud drive you control.
   You should see: A file called release.keystore on your computer.
   (Takes: 2 minutes · Only you can do this)

3. Put your key into GitHub as a secret
   Open your repository on GitHub, then: Settings → Secrets and variables → Actions → New repository secret. Add the four secrets listed in SHIPPING.md. "Secret" means GitHub stores it encrypted — nobody, including NavBharatAI, can read it back.
   You should see: Four secrets listed on that page (their values stay hidden — that is correct).
   (Takes: 5 minutes · Only you can do this)

4. Build the app
   Press the build button in NavBharatAI (or on GitHub: Actions tab → "Build Android App Bundle" → Run workflow). GitHub’s computers compile and sign your app for you — your own computer does nothing.
   You should see: A green tick next to the build, after several minutes.
   (Takes: 5–10 minutes · NavBharatAI does this for you)

5. Download your app
   When the build turns green, download it right here in NavBharatAI. You get two files: the .aab is the one Google Play requires, and the .apk is one you can send to your own phone and install immediately to try the app out.
   You should see: An .aab file and an .apk file downloaded to your device.
   (Takes: Instant · NavBharatAI does this for you)

6. Create the app in Play Console and fill its store page
   In Play Console press "Create app", enter your app name and language, and pick Free or Paid (this cannot be changed later if you pick Free). Then fill the store listing: a short description, a full description, at least 2 phone screenshots, an app icon (512×512), and a feature graphic (1024×500).
   You should see: Green ticks next to "Store listing" in Play Console’s task list.
   (Takes: 30–60 minutes · Only you can do this)

7. Answer Google’s questionnaires
   Play Console asks about your app’s content rating, who your audience is, ads, and a Data Safety form describing what information your app collects. Answer honestly — a wrong answer here is the most common reason an app gets removed later. You also need a privacy policy web page and its link.
   You should see: All questionnaire sections marked complete.
   (Takes: 30 minutes · Only you can do this)

8. Upload the .aab and send it for review
   Play Console → Production → Create new release → upload the .aab file you downloaded → write a short "what’s new" note → Review release → Start rollout to Production.
   You should see: Your release shown as "In review".
   (Takes: 10 minutes to submit; Google’s review usually takes 1–7 days · Only you can do this)

9. You are live
   Once Google approves it, your app appears on the Play Store. For every future update, just build again in NavBharatAI and upload the new .aab — the version number is increased automatically, so Google never rejects it as a duplicate.
   You should see: Your app’s public Play Store page.
   (Takes: A few hours after approval)

```

## Apple App Store

```
Publishing your app on the Apple App Store

Before you start: You need an Apple Developer account (about $99 / ₹8,000 EVERY year — the app is removed if you stop paying). Expect roughly 3 hours of your own work, then 1–3 days for Apple to review. You do NOT need a Mac or an iPhone to build it — NavBharatAI builds it on a real Apple computer inside GitHub for you.

1. Join the Apple Developer Program
   Go to the Apple Developer site and enrol with your Apple ID. Apple charges about $99 (roughly ₹8,000) EVERY YEAR — if you stop paying, your app is removed from the App Store. Apple verifies your identity, and for a company account they also ask for business documents.
   You should see: Your membership shown as active, with a Team ID.
   (Cost: About $99 (~₹8,000) per year, recurring · Takes: A few minutes to pay; approval can take 1–2 days · Only you can do this)
   Link: https://developer.apple.com/programs/enroll/

2. You do NOT need a Mac or an iPhone to build
   Building an iPhone app normally requires a Mac. NavBharatAI works around this honestly: the build runs on a real Apple computer rented by the minute inside GitHub, so you never have to buy one. You will still want an iPhone (or a friend’s) to actually test the app.
   (NavBharatAI does this for you)

3. Create the app entry in App Store Connect
   Go to App Store Connect → My Apps → the + button → New App. Give it a name and select the bundle id that matches your app (NavBharatAI shows you this id). This creates the empty shelf your builds will land on.
   You should see: Your app listed under My Apps.
   (Takes: 5 minutes · Only you can do this)
   Link: https://appstoreconnect.apple.com/apps

4. Create an App Store Connect API key
   App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key and choose the "Admin" role (a lower role cannot sign the app). Download the .p8 file — Apple lets you download it only ONCE, so save it carefully. Note the Key ID and the Issuer ID shown on that page.
   You should see: A downloaded AuthKey_XXXXXX.p8 file, plus a Key ID and an Issuer ID.
   (Takes: 5 minutes · Only you can do this)

5. Put the Apple key into GitHub as secrets
   On GitHub: Settings → Secrets and variables → Actions → New repository secret. Add the four iOS secrets listed in SHIPPING.md, including pasting the whole contents of that .p8 file. GitHub stores them encrypted.
   You should see: Four iOS secrets listed (values hidden — that is correct).
   (Takes: 5 minutes · Only you can do this)

6. Build and send it to TestFlight
   Press the iOS build button in NavBharatAI with "upload" turned on. GitHub builds and signs the app on a real Apple computer and uploads it to TestFlight — Apple’s official app for trying an app before it is public.
   You should see: A green tick, then the build appears in App Store Connect → TestFlight.
   (Takes: 15–25 minutes · NavBharatAI does this for you)

7. Try the app on a real iPhone
   Install the TestFlight app from the App Store on your iPhone and sign in with the same Apple ID. Your build appears there and you can install it like a normal app. Anyone you invite as a tester can too.
   You should see: Your app installed on the phone through TestFlight.
   (Takes: 10 minutes · Only you can do this)

8. Fill the App Store page
   In App Store Connect, fill your app’s description, keywords, support URL, and privacy policy link, and upload screenshots for the required iPhone sizes (6.7-inch and 6.1-inch, at least 3 each). Also complete the App Privacy section describing what data you collect.
   You should see: No remaining red warnings on the app’s page.
   (Takes: 45–90 minutes · Only you can do this)

9. Submit for review
   Select the build you sent to TestFlight, then press "Add for Review" and "Submit". Apple reviews apps by hand and is stricter than Google — if they reject it, they tell you exactly which guideline, and you fix it and submit again. A rejection is normal and not a failure.
   You should see: Status changing to "Waiting for Review".
   (Takes: Apple’s review usually takes 1–3 days · Only you can do this)

10. You are live
   After approval your app appears on the App Store. For updates, build again in NavBharatAI — the build number increases automatically, so Apple never rejects it as a duplicate.
   You should see: Your app’s public App Store page.
   (Takes: A few hours after approval)

```
