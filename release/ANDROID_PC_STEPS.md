# Android 1.2 (versionCode 21) — build on the Windows PC

Prepared 2026-10-23. versionCode 21 / versionName 1.2 are already set in
android/app/build.gradle (Play currently has 20 / 1.1).

1. Open a terminal in the pm-app folder on the PC (E:\pm-app, or the
   pm-app-redesign checkout you build from). Get the latest code
   (works once Scott has said "push it" on the Mac):
       git fetch origin
       git checkout main
       git pull
   Do NOT commit android/gradle.properties (Windows JDK path stays local).
2. Create `.env.production.local` in the repo root (git-ignored) with:
       VITE_SUPABASE_URL=https://ihualqkokgchmzoeumxo.supabase.co
       VITE_SUPABASE_ANON_KEY=<publishable key: Supabase > Project Settings > API>
       VITE_CALMSKY_REDESIGN=true
3. Build and sync:
       npm install
       npm run build
       npx cap sync android
   Check the manifest did not change: `git diff android/app/src/main/AndroidManifest.xml`
   should be empty (revert it if only whitespace).
4. Build the bundle:
       cd android
       .\gradlew.bat bundleRelease
   Signing uses android\keystore.properties -> E:\confidantpm-release-key.jks.
   Output: android\app\build\outputs\bundle\release\app-release.aab
5. Play Console > ConfidantPM > Production > Create new release > upload the
   .aab > release name 1.2 > paste the "What's New" text from
   release/WHATS_NEW.md > Save > Review release > Start rollout.
6. Store listing refresh (Grow users > Store presence > Main store listing):
   - Feature graphic: design/play-store/feature-graphic-1024x500.png
   - Phone screenshots: design/play-store/screenshots/ (1080x1920, new look)
   - App icon 512: design/play-store/icon-512.png (check it is the navy tile;
     regenerate from design/logo/icon-tile.svg if it still looks charcoal)
7. Back up E:\confidantpm-release-key.jks if you have not.
