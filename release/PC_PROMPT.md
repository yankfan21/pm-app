# Prompt for Claude Code on the Windows PC

Paste this into a new Claude Code session opened in the pm-app repo folder
(E:\pm-app, or the checkout you build from).

---

Build and upload the Android release of ConfidantPM (repo yankfan21/pm-app).

1. Run `git pull` on `main`, then read CLAUDE.md (sections "Android / Google
   Play" and "Release status 2026-10-24") and `release/ANDROID_PC_STEPS.md`.
   Follow that file step by step.
2. Version is already set: versionCode 21, versionName 1.2 in
   android/app/build.gradle. Don't change it unless Play rejects the code as
   already used.
3. `.env.production.local` (git-ignored) needs VITE_SUPABASE_URL=
   https://ihualqkokgchmzoeumxo.supabase.co, VITE_CALMSKY_REDESIGN=true and
   VITE_SUPABASE_ANON_KEY. If the key is missing, ask me for it; don't guess.
4. Build: `npm run build`, `npx cap sync android`, then
   `cd android && .\gradlew.bat bundleRelease`. Signing uses
   android\keystore.properties -> E:\confidantpm-release-key.jks (don't print
   or copy the keystore or its passwords).
5. Rules: never commit android/gradle.properties (Windows JDK path); after
   `cap sync`, `git diff android/app/src/main/AndroidManifest.xml` must be
   empty (revert whitespace-only changes). Ask before pushing anything.
6. When the .aab is built, tell me its full path and size. I upload it in
   Play Console myself (Production > Create release). "What's New" text is in
   `release/WHATS_NEW.md` (Google Play section). Also remind me to update the
   store listing with design/play-store/feature-graphic-1024x500.png,
   design/play-store/screenshots/ and design/play-store/icon-512.png.
7. Say plainly what you built and what you didn't test.
