# Next session prompt

Paste everything below the line into a new session.

---

Continue ConfidantPM work (repo yankfan21/pm-app, live at confidantpm.com). Work in
the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi.
Switch the session to that folder first, then read CLAUDE.md all the way through,
especially "CalmSky theme: switched to the Professional look", "iOS App Store
release" (1.2 rejection notes, 1.3 note) and "Android / Google Play".

Standing rules:
- Ask before pushing or deploying anything (main auto-deploys to Vercel). Local
  commits are fine. I'll say "yes, push it".
- Never run the white-label branding migration against production. Branding is
  PARKED; don't work on it.
- android/gradle.properties (Windows JDK path) stays uncommitted; design/appstore/,
  design/variants/ and build/ are untracked on purpose.
- Verify changes in the dev preview (calmsky-dev, port 5183, fake Supabase data)
  before saying they work; check a deploy by its asset hash, not just Vercel's
  success status.
- Keep answers short, say plainly what you did and did not test. Show me
  screenshots (send the files) rather than describing them; when you give me
  something to copy put it in a file or a fenced block. One change at a time.

Where we are (2026-10-23): the look is FINAL and live on web: the Professional
theme (deep navy rail and top bar, cool light-grey page, white cards, one navy
blue accent, tight corners) plus a navy Dashboard footer to match the top bar.
Last pushed commit on main: 9f8ed57. I tried many colourways today (charcoal,
teal, graphite, slate, header band, softer whites) and chose to stay with
Professional; don't reopen the web look. The charcoal look was restored and then
reverted again, so CLAUDE.md sections describing charcoal as current are history.
The "See how it works" stills and clips already match this look.

The two to-dos, in order:

1. DESIGN the iOS and Google Play versions in the Professional look. The native
   apps bundle `dist`, so they still carry the old charcoal look, icons and splash.
   - Check the phone layout (/m/... routes: home, project overview, Tasks,
     Documents, More, Settings, Comms document pages, login and marketing on a
     phone) for leftover charcoal or hard-coded dark colours. `design/tools/shoot.mjs`
     does phone screenshots plus a colour scan; `design/tools/crawl.mjs` does
     hover/focus/modals. The iPad uses the desktop layout (navy rail).
   - Decide how the phone looks in navy (no rail on a phone: header bar and tab bar
     treatment, one accent colour). Show me mock-ups before building.
   - New app icon and splash in navy: regenerate from `design/logo/icon-tile.svg`
     via `@capacitor/assets` (sources in `resources/`). Web theme-color and
     manifest are already navy (#14233a).
   - New store screenshots (`design/tools/store.mjs`, `store-ipad.mjs`,
     `store-play.mjs`), Play feature graphic (`design/play-store/`), and
     `public/og-image.png`. Sizes and gotchas are in CLAUDE.md.

2. UPLOAD to the stores. Pending native-visible changes since the last submitted
   builds (iOS 1.3 (1), Android 1.1 / versionCode 20): Professional look and
   icons/splash, landscape phones keep the phone layout, Dashboard welcome tour,
   video walkthrough. Bundle them into one release.
   - iOS: follow the build steps in CLAUDE.md (git-ignored `.env.production.local`
     with the Supabase values and VITE_CALMSKY_REDESIGN=true, bump
     MARKETING_VERSION to 1.4 build 1, `npm run build`, `npx cap sync ios`,
     archive with xcodebuild, I upload and submit). KEEP SceneDelegate.swift and
     UIApplicationSceneManifest when running cap sync (an iOS 27 launch crash got
     1.2 rejected). Test on my iPad and iPhone from TestFlight first; this Mac only
     has an iOS 26.5 simulator. Run `npx cap open ios` from ~/pm-app-redesign.
   - Android: the build runs on my PC (signing key E:\confidantpm-release-key.jks,
     Windows JDK path). Prepare everything here, bump versionCode to 21 or higher,
     and give me exact PC steps in a file. Upload in Play Console.
   - Store listing text: Play short description changed 2026-10-15 to "Project
     management that knows your project, for independent PMs and agencies." (check
     it shows live). Write What's New for both stores.

Start by telling me what you'd tackle first and why. I'm usually at my Mac now but
sometimes on an iPad (can't run npm); send files directly.
