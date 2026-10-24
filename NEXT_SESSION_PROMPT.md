# Next session prompt

Paste everything below the line into a new session.

---

Continue ConfidantPM work (repo yankfan21/pm-app, live at confidantpm.com). Work in
the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi.
Switch the session to that folder first, then read CLAUDE.md all the way through,
especially "iOS App Store release" (1.2 rejection notes, 1.3 note) and
"Android / Google Play". The charcoal-look sections are history; the look is the
Professional theme.

Standing rules:
- Ask before pushing or deploying anything (main auto-deploys to Vercel). Local
  commits are fine. I'll say "yes, push it".
- Never run the white-label branding migration against production. Branding is
  PARKED; don't work on it.
- android/gradle.properties (Windows JDK path) stays uncommitted; design/appstore/,
  design/variants/ and build/ are untracked on purpose.
- Verify changes in the dev preview (calmsky-dev; port 5183 may be taken, the
  preview tool then picks 5184) before saying they work; check a deploy by its
  asset hash, not just Vercel's success status.
- Keep answers short, say plainly what you did and did not test. Show me
  screenshots (send the files) rather than describing them; when you give me
  something to copy put it in a file or a fenced block. One change at a time.

## What we did on 2026-10-23 (all pushed to main, last commit a87e8f4)

- Phone audit of 15 /m/ screens: no charcoal leftovers. The repo's shoot.mjs scan
  looks for blue hues (made for the charcoal theme); a custom dark/warm scan was
  used instead and found nothing.
- Phone look "D" built (src/theme-calmsky.css, end of file, phone layout only):
  navy header band with a white logo mark (Home brand row and the project top
  bar), light tab bar with navy icons and labels, selected tab dark navy + bold +
  blue bar on top, navy-tinted Demo badge instead of mint. I checked it on my
  phone's /m/ web version and it looks good.
- Navy app icon and splash applied: resources/*.svg, design/logo/icon-tile.svg,
  public/favicon.svg, regenerated iOS and Android assets with
  `npx capacitor-assets generate --ios --android` (use
  `npm_config_cache=<scratch dir>`, ~/.npm is root-owned), Android
  ic_launcher_background now #14233a, web icons and favicon.ico re-rendered.
  SceneDelegate.swift, Info.plist and AndroidManifest.xml untouched (the generator
  only reformatted the manifest's whitespace; revert that if it recurs).
- Not done: public/og-image.png, Play feature graphic (design/play-store/), App
  Store and Play screenshots are still in the old look. No native build has been
  made yet. The Play short description ("Project management that knows your
  project, for independent PMs and agencies.") has not been confirmed live.

## Next steps, in order

1. Store assets in the new look: iPhone and iPad screenshots
   (`design/tools/store.mjs <outDir> [6.3]`, `store-ipad.mjs`), Play screenshots
   (`store-play.mjs`), Play feature graphic, public/og-image.png. Sizes and
   gotchas are in CLAUDE.md. Preview server needs VITE_DEV_BYPASS_AUTH=true and
   VITE_CALMSKY_REDESIGN=true.

2. iOS 1.4 build 1, ON THIS MAC (run `npx cap open ios` from ~/pm-app-redesign,
   never ~/pm-app):
   - Ask me for the Supabase publishable key; write the git-ignored
     `.env.production.local` (VITE_SUPABASE_URL=https://ihualqkokgchmzoeumxo.supabase.co,
     VITE_SUPABASE_ANON_KEY, VITE_CALMSKY_REDESIGN=true).
   - Bump MARKETING_VERSION to 1.4 (CURRENT_PROJECT_VERSION 1) in
     ios/App/App.xcodeproj/project.pbxproj.
   - `npm run build`, `npx cap sync ios`. KEEP SceneDelegate.swift and
     UIApplicationSceneManifest in Info.plist (an iOS 27 launch crash got 1.2
     rejected); confirm both are intact after sync.
   - Archive with `xcodebuild -project ios/App/App.xcodeproj -scheme App
     -configuration Release -destination 'generic/platform=iOS' -archivePath
     build/<name> -allowProvisioningUpdates archive`; I `open` the .xcarchive and
     upload via Organizer > Distribute App > App Store Connect.
   - I test on my iPad and iPhone from TestFlight BEFORE adding the build to the
     version and submitting. Check the navy header under the status bar, the new
     icon/splash, landscape phone layout, welcome tour, video walkthrough. This
     Mac only has an iOS 26.5 simulator, so iOS 27 behaviour needs a device.

3. Google Play, ON MY WINDOWS PC (signing key E:\confidantpm-release-key.jks,
   keystore.properties and the Windows JDK path live only there; this Mac has no
   Java, Android SDK or keystore). Prepare here, then write exact PC steps to a
   file I can open on the PC (send it to me):
   - Bump versionCode in android/app/build.gradle to 21 or higher (21 unless
     already used) and versionName 1.2 or whatever fits; commit locally.
   - Steps for the PC: git pull (after I say push), `.env.production.local` with
     VITE_CALMSKY_REDESIGN=true and the Supabase values, `npm run build`,
     `npx cap sync android`, `cd android && ./gradlew.bat bundleRelease`, output
     android/app/build/outputs/bundle/release/app-release.aab, upload in Play
     Console > Production > create release.
   - If I say I built Android on the Mac last time, ask where the keystore is
     (none was found on this Mac) before assuming.

4. Write "What's New" text for both stores (iOS 1.4, Play), covering: new
   professional navy look and icon, landscape phones keep the phone layout,
   Dashboard welcome tour (iPad), video walkthrough.

5. Afterwards: update CLAUDE.md (release status, new look notes), and tidy the
   stale charcoal notes if there is time.
