# ConfidantPM — orientation

Full-stack AI-assisted project management tool (formerly called "PM-App").
Core design principle: AI guides PMs through structured Q&A (one question per
screen, progress indicator, compact AI suggestions — never open-ended chat
boxes), always referencing prior project documents before asking new
questions, and never acting autonomously without PM confirmation.

## Stack
- Frontend: React / Vite
- Backend: Supabase (Postgres, Edge Functions, Auth, RLS)
- AI: Anthropic API (Claude) via Edge Functions
- Deployment: Vercel (auto-deploy on push to main)
- Local path: E:\pm-app
- Live URL: confidantpm.com (canonical). The old
  pm-app-tau-seven.vercel.app 308-redirects here, so it still works but
  should not be used in new links, docs, or deploy checks.
- Email: Resend (signed up, not yet integrated)
- Document parsing: mammoth (for .docx Charter uploads)

## Workflow
- Straight-to-main commits. Vercel auto-deploys on push. No PR process.
- SQL migrations: file-first, not manual-run-only. Every migration must be
  written to a versioned file under supabase/migrations/ before it's run, so
  it's tracked in git regardless of who executes it. Claude Code can and
  does run migrations directly against production via
  `npx supabase db query --linked` (project ref ihualqkokgchmzoeumxo,
  actively linked) — no need to hand off to Scott for SQL editor execution.
- Edge Functions: can be deployed directly via CLI —
  `npx supabase functions deploy <function-name> --project-ref
  ihualqkokgchmzoeumxo` — confirmed working 2026-08-30, no Docker required
  despite the CLI warning. Dashboard paste is no longer necessary as the
  default method. Source still gets committed to the repo as before. JWT
  verification must be manually disabled per new Edge Function in Supabase
  Settings.
- Any code/output Scott needs to copy elsewhere (migrations, Edge Function
  code) should be written to a file with the path given — never rely on
  terminal copy/paste (causes line-wrapping corruption in Notepad).

## Guardrails / product principles
- PM-acceptance guardrail: once a PM accepts tasks, budget items, or
  documents, AI can never modify them without explicit PM action.
- AI always references prior project context before asking new questions —
  no re-asking audience, cadence, channels, etc. that are already answered.
- Comms versioning: AI-generated documents that accumulate over time (Exec
  Comms, Newsletter) propose new versions for PM review, never silently
  overwrite accepted versions — old versions kept in history.
- Project-eval honest uncertainty: evaluations flag missing evidence rather
  than fabricating confidence.
- PM stays in control: auto-calculated things (e.g. phase dates) always get
  a manual override option.

## Known infrastructure quirks
- ANTHROPIC_API_KEY is a shared project secret in Supabase (set once, not
  per-function).
- Anthropic API credits are prepaid/pay-as-you-go, separate from Claude Pro
  subscription.
- max_tokens: standard is 4000 with retry logic (up to 3 attempts, backoff
  for 429/529 errors) — past failures came from setting this too low,
  causing JSON truncation on long outputs.
- Vercel cache: confirm deploys via asset hash verification, not just
  deploy-success status.

## Known follow-ups

Tracked here so they don't get forgotten between sessions. Not scheduled
work — just flags for future decisions.

- **`tasks.completed` is a temporary parallel status source.**
  `gantt_milestones_and_delayed_status.sql` added `tasks.status`
  (`not_started` / `in_progress` / `completed` / `delayed`), backfilled from
  the pre-existing `completed` boolean. `completed` was deliberately left in
  place rather than dropped, since frontend code (task checkbox, sprint
  stats) still reads/writes it. Eventually: migrate all frontend
  reads/writes to `status`, then drop `completed`.

- **`tasks.depends_on` is now dead in application code — column still exists
  in the DB.** Phase 1 (`task_dependencies_schema.sql`) added the real join
  table (`task_id`, `depends_on_id`) and backfilled it from every existing
  `depends_on` value (139 rows, all same-project). Phase 2 migrated every
  frontend/Edge Function read and write site (`ProjectDetail.jsx`,
  `TaskGenFlow.jsx`, `TaskImportFlow.jsx`, `GanttChart.jsx`,
  `ganttExport.js`, `project-eval/index.ts`) off the scalar column onto
  `task_dependencies` — verified working (task form, AI-gen, import, Gantt
  connector lines, PDF/Excel export). The `depends_on` column itself was
  deliberately left in place rather than dropped, so if a future session
  finds it still sitting on `tasks`, that's expected — it's just inert.
  Eventually: drop `tasks.depends_on` in a migration.


### Demo projects (is_demo = true) — dates and Gantt data, 2026-10-10

Demo content is hand-built in production and reset nightly (08:00 UTC,
`restore_demo_projects()`) from `*_demo_snapshot` tables. As of 2026-10-10
(`demo_dynamic_dates_and_gantt_showcase.sql`, `demo_gantt_showcase_curated.sql`,
both already run in production) the reset slides every demo date (tasks,
phases, milestones, sprints, project deadline) by the whole days since
`demo_snapshot_meta.anchor_date`, so the demos always sit around today.
`task_dependencies` is now part of the snapshot (before, the nightly task
delete cascaded them away and never restored them). Issue/risk/charter
dates are not shifted. The waterfall and hybrid demos have a hand-written
schedule: all four statuses, milestone markers, tasks with several
predecessors. To change demo content: edit it live, then run
`select public.capture_demo_snapshot();` (this also resets the anchor to
today). The agile demo has no task dates, so the shift does nothing for it.
`npx supabase` needs a login in this checkout (`supabase login`, then
`link`), and `~/.npm` is root-owned: use `npm_config_cache=<scratch dir>`.

## CalmSky theme: switched to the "Professional" look — 2026-10-23

The owner found the charcoal look too dark and broody and asked for a more
professional feel. `src/theme-calmsky.css` was rewritten (the flag and file
name are unchanged): deep navy rail and top bar (`#14233a`, re-scoped text and
accent tokens inside `.app-sidebar` / `.top-bar`), cool-grey page `#f6f7f9`,
white cards with 1px `#e1e5ea` borders, one navy accent `#1e4d8c`, tight corners
(6-10px, no pill buttons), one font family (Hanken Grotesk), AA-checked status
colours. This reverses the earlier "dark only, round shapes, no light themes"
decisions on the owner's request; the old charcoal theme is in git history
(commit `d445ce2` and before). The five "See how it works" screenshots in
`src/assets/tour/` were recaptured in this look (1100px viewport at 1.27x,
3:2) and the pop-up widened (up to 1180px). Web `theme-color` and manifest colours
are now navy `#14233a` (they were charcoal). Verified 2026-10-23 by a computed
colour scan of 27 desktop routes (no stray dark surfaces) plus screenshots of the
Dashboard, project pages, Gantt, login and marketing. NOT yet re-checked: the
mobile `/m/` screens, Comms "document" pages, login/marketing on a phone,
native iOS/Android (need a rebuild; icons and splash screens are still charcoal),
and the store screenshots in `design/appstore` and `design/play-store` (old look).
To roll back the look: `git revert 977cee0` (theme + pop-up) — later commits
build on it, so revert may need conflict resolution.

## CalmSky_Redesign and white-label branding — status as of 2026-10-10

**LIVE as of 2026-10-10.** The redesign was merged to `main` (fast-forward) and
pushed with the owner's approval; `VITE_CALMSKY_REDESIGN=true` is now set in
Vercel Production, so confidantpm.com shows the CalmSky look. Latest pushed
commit `b10a40e` (dashboard cards: Target Go Live on its own row). To roll the
theme back, remove that Vercel env var and redeploy (the shipped navy theme is
still in the code). Work was developed on branch `claude/wonderful-lovelace-7l64oi`
(git worktree `~/pm-app-redesign`). Standing rule: ask before pushing or
deploying unless the owner says to push (they did for the 2026-10-23 theme and
walkthrough work). Never run the branding migration against production.

**(Superseded 2026-10-23: the owner later asked for the "Professional" light look described above; this paragraph and the "Decided look" one below are history.)**
The earlier light "Paper" theme was removed (commit 5dccf96). The owner
rejected light themes (tinted looked dirty, white stark), purple/magenta, ice
white, glows and heavy effects, and the bold palettes.

**Former look, replaced 2026-10-23 ("Friendly" dark, Calm Sky accent):** warm charcoal base
(#171614, cards #1f1d1a), calm sky accent #7ab8f0 for primary actions, nav and
Today only, round shapes (pill buttons, 18px cards), Schibsted Grotesk
headings + Hanken Grotesk body, human greeting copy, muted traffic-light
statuses, light "document" pages for Comms outputs, subtle quick motion,
balanced density. Logo: open C ring with a milestone diamond, "PM" in the
wordmark carried by the accent. Reference mockups: `design/dark/friendly.html`
and `friendly-screens.html`; logo files in `design/logo/` (SVG); real-app
screenshots in `design/screens/` (desktop) and `design/screens/mobile/`.

**How it is built:** `src/theme-calmsky.css` overrides the index.css tokens
under `:root[data-theme='calmsky']`, plus component rules per stage.
`src/main.jsx` sets `data-theme` from the flag; `src/redesign.js` exports
`CALMSKY` for gating JSX. Components that only exist in the redesign
(`CourseLine`, `AvatarStack`) and their extra queries are rendered/run only
when `CALMSKY` is true. `initialsFromEmail` moved to `src/initials.js`.

**Done (all pushed to `main` and live):** Gantt critical path now muted amber `#d98f2b` with a 2.5px ring (set under calmsky only; legend arrow follows), mobile delete-account modal scanned clean on 2026-10-10 via a dev-only canned `delete-account` preview in `src/dev/devSupabase.js` (execute stays disabled), tokens, logo mark, shell and
dashboard (greeting, project cards with course line + avatars), Q&A step
(segmented progress, ghost-text suggestion, Tab accepts while the field is
empty), Gantt (done solid / not started dashed / in progress tinted / delayed
red, Today = accent line), stray navy/blue sweep (verified by a computed-colour
scan of 18 desktop routes), mobile app (home with course-line cards, contrast
fixes; the remaining project screens Documents, Status update, Exec comms,
Newsletter, Comm plan, Stakeholders, Issues, More and Settings were checked by
screenshot plus colour scan, 2026-10-10), login / forgot / reset / privacy / marketing pages (scan-clean on
desktop and phone; login needs `VITE_DEV_BYPASS_AUTH=false` plus dummy
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` on a second vite, since the real
Supabase client throws without a URL).

**Not done / open:**
- iOS Simulator check done 2026-10-10 (iPhone 17 Pro, Safari, localhost:5183): home, project overview, More and the Contact form render correctly, no input auto-zoom; found and fixed the iOS system-blue input focus ring (CalmSky-only rule on `.mobile-app`). Physical iPhone 13 checked via TestFlight 2026-10-10 (iOS 1.2 build works).
- Not covered by the 2026-10-10 hover/focus/modal crawl (`design/tools/`): states that
  only appear after other interactions, and the dashboard AI note / waiting
  list (not built).
- Leftovers tidied 2026-10-10: `.revision-preview` tint now derives from
  `--charter-accent` (was hardcoded navy rgba); the `.mobile-metrics-card` slate
  border derives from `--zone-accent-neutral` (same value in the shipped theme).
  That slate/raised rule stays shipped-theme-only on purpose; under calmsky the
  card keeps the plain fill and `--border`. The shipped-theme CSS bugs found along the way are now fixed
  in the shipped CSS too (2026-10-10, not flag-gated): `.mobile-doc-row`
  border-box (`mobile.css`), `.mobile-desktop-link` font inherit
  (`mobile.css`), and the risk-card fields' resting border via
  `.risk-field .risk-cell-input` (`App.css`; `.risk-cell-input:focus` still
  wins the tie and shows the accent). Verified by computed styles in both themes.
- Done 2026-10-10 (pushed and live; not flag-gated): web icons in `public/` (favicon, PNGs,
  maskables, apple-touch-icon) and native iOS/Android icons plus charcoal
  splash regenerated from `design/logo/icon-tile.svg` via `@capacitor/assets`
  (sources in `resources/`); `theme-color` and manifest colours are charcoal
  `#171614`. Still open: `public/og-image.png` now carries the CalmSky look (draft kept at
  `design/logo/og-image-draft.png`); no outlined wordmark file yet; native apps need
  `npx cap sync` and a rebuild to pick any of this up.
- Not built because there is no data behind it: the dashboard AI note and
  "Waiting for your decision" list (needs a product decision on what the AI
  flags / what counts as pending); a late-milestone state (milestones have no
  done/late field, so the course line only shows passed vs upcoming by date).
- Health is shown only in the status badge now (amber/red card bars removed).
- Agile zone indigo (`--agile-accent`) and the document-preview indigo
  (`--paper-accent`) were deliberately kept.
- Fixed 2026-10-10 (verified by clicking through in the dev preview: the badge switches to Hybrid with no reload): the
  "Switch to Hybrid" header badge staying on Waterfall was real stale state, not
  just the dev fake. `ScopingFlow` now takes `onProjectUpdated`, and the two
  callers (`ProjectDocSectionRoutes.jsx`, `DocumentsRoute.jsx`) pass `setProject`,
  newly exposed from `ProjectDetailLayout`'s outlet context. This fix is not
  gated by the redesign flag, so it also changes the shipped theme's behaviour.
- `.claude/launch.json` defines the preview server on port 5183 (5173 is often
  taken by another project's server).

**Verification tools (`design/tools/`):** `shoot.mjs` (phone screenshots plus
colour scan per route) and `crawl.mjs` (hover/focus/click-everything scan,
screenshots any modal or form that opens). Both use the repo's puppeteer and
Chrome at `/Applications/Google Chrome.app`. The dev fixtures now include
milestone markers and a multi-predecessor dependency so the Gantt diamonds and
dashed arrows render. Done 2026-10-10: Gantt legend arrows use
`var(--neutral-400)`, danger hover ink warm, risk form borders, mobile
locked-doc row and desktop-link font fixed.

**Local preview:** `.env.local` (git-ignored) with `VITE_DEV_BYPASS_AUTH=true`
and `VITE_CALMSKY_REDESIGN=true`, then `npm run dev` (or the `calmsky-dev`
preview on 5183). The bypass swaps in an in-memory fake Supabase (`src/dev/`)
with sample data and only works when `import.meta.env.DEV` is true. Add
`VITE_DEV_ORG=true` to preview a sample branded organization. Phone screens
live under `/m/...` (headless Chrome will not go narrower than ~500px; use
puppeteer device emulation, see the scratch shoot script approach, or the
browser pane's mobile viewport).

### iOS App Store release (1.2, submitted 2026-10-10)

iOS 1.2 (build 1) with the CalmSky look, new icon and charcoal splash was
uploaded and submitted for App Review on 2026-10-10 (1.0 and 1.1 passed
review earlier). Live version before it: 1.1. The native app bundles `dist`
(no `server.url`), so the redesign only reaches phones via a new build.

How a build is made (repeat for the next release):
1. Put the Supabase values in a git-ignored `.env.production.local`:
   `VITE_SUPABASE_URL=https://ihualqkokgchmzoeumxo.supabase.co`,
   `VITE_SUPABASE_ANON_KEY` (publishable key, Supabase > Project Settings >
   API) and `VITE_CALMSKY_REDESIGN=true`. Without the URL the build and the
   prerender step fail with "supabaseUrl is required".
2. Bump `MARKETING_VERSION` (and `CURRENT_PROJECT_VERSION` if the version
   number is unchanged) in `ios/App/App.xcodeproj/project.pbxproj`. A new
   version string may restart at build 1; a build number must be unique
   within a version.
3. `npm run build`, then `npx cap sync ios`.
4. Archive: Xcode > Product > Archive on "Any iOS Device (arm64)", or
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration
   Release -destination 'generic/platform=iOS' -archivePath <path> -allowProvisioningUpdates archive`
   (Claude Code can do this locally). Then Xcode > Window > Organizer >
   Archives > Distribute App > App Store Connect > Upload (owner does the upload).
5. App Store Connect: add the version, What's New, screenshots, pick the
   processed build, check App Review login, Submit. Test the build in
   TestFlight on the phone first.

**1.2 (1) was REJECTED 2026-10-12 (guideline 2.1(a), launch crash on iPad Air M3, iPadOS 27.0.1).**
Cause: no UIScene lifecycle (AppDelegate only, no `UIApplicationSceneManifest`); iOS 27 kills such
apps at launch. Fixed in commit 818e332: `ios/App/App/SceneDelegate.swift` (forwards URL opens and
universal links to `ApplicationDelegateProxy`), `UIApplicationSceneManifest` in `Info.plist`
(`UIMainStoryboardFile` removed), build number bumped to 1.2 (2). Capacitor 8.4.2 has no scene
support of its own, so keep this when running `cap sync`/upgrading. Build 1.2 (2) installed from
TestFlight and logged in fine on the owner's iPad (iPadOS 27.0.1, the version that crashed in
review) and iPhone. Mac has only an iOS 26.5 simulator runtime, so iOS 27 crashes cannot be
reproduced locally; test on a device. Resubmitted 2026-10-12 2:35 AM with build 1.2 (2) (status: Waiting for Review). In App Store Connect the Resubmit button only unlocks after adding the new build on the version page and replying to Apple's message.

**1.2 (2) was REJECTED again 2026-10-13 (guideline 5.1.1(v), "no account deletion option").** Deletion
already exists: Dashboard footer Settings link, then Danger Zone, then Delete Account (desktop/iPad layout,
`DeleteAccountFlow.jsx`); phone layout More, Settings, Danger Zone (`MobileDeleteAccount.jsx`). The reviewer
on the iPad missed it. Decision (owner): no code change and no new build. Replied in App Review on
2026-10-13 6:21 AM with the steps and a screen recording from the owner's iPad (throwaway account),
asking Apple to approve 1.2 (2) as a bug-fix submission without resubmitting; the same recording
(`account-deletion-demo.mp4`, lowercase extension, the uploader rejects `.MP4`) and a note are saved in
App Review Information on the version. Status after that: Rejected, Resubmit greyed, waiting for Apple.
**Apple APPROVED 1.2 (2) (reported 2026-10-15)** after the reply and recording; no code change or new build was needed.
Build 1.2 (3) (adds a Delete account item to the Dashboard Account menu and a Delete Account row on
the phone More screen) was built, uploaded and then expired in TestFlight; the code is local commit
`412bdd8`, reverted by `8ea8051`, on main but inactive. Not needed now that 1.2 (2) is approved; re-apply `412bdd8` only if a future review asks again.

**1.3 (1) submitted 2026-10-15, APPROVED and LIVE on the App Store the same day (owner downloaded it).** Fixes the iPad (desktop layout) drawing under the
status bar: `viewport-fit=cover` lets the page extend under it and only the phone layout padded for it.
Fix is `env(safe-area-inset-top)` on `.top-bar`, `.app-shell:not(.app-shell-top)` and `.app-sidebar`
(end of `App.css`, commit `25a0a27`, not flag-gated, 0 in desktop browsers). Build 1.2 (2) was approved
first, so the next build had to be a new version (1.3, build 1). Verified on the owner's iPad from
TestFlight; also live on the web. Archive was made with `xcodebuild ... archive` into `build/`
(untracked); `open` the `.xcarchive` to load it in the Organizer, then Distribute App.

Gotchas:
- Run `npx cap open ios` from `~/pm-app-redesign`, not `~/pm-app` (old
  `ui-redesign` checkout, version 1.0, stale bundle). The Xcode status bar
  shows the branch; it must read `claude/wonderful-lovelace-7l64oi`.
- `ITSAppUsesNonExemptEncryption` is false in `Info.plist` (HTTPS only), so
  App Store Connect no longer asks the export-compliance question per build.
- Screenshot slots: "iPhone with Dynamic Island (medium display)" takes
  1206x2622 or 1179x2556 (not 1320x2868); iPad 13" took 2752x2064. Tools:
  `design/tools/store.mjs <outDir> [6.3]` (phone) and `design/tools/store-ipad.mjs`
  (iPad, desktop layout). Finished sets are in `design/appstore/upload/`
  (uncommitted). The dev sample data in `src/dev/devFixtures.js` was extended to six projects
  for these shots.
- The native app already hides the "View desktop site" link and store badges
  (`Capacitor.isNativePlatform`); the capture scripts hide them to match.

### White-label branding (PARKED)

Code and `BRANDING.md` are in `main`, inert (`BrandingProvider` only acts on the removed Paper theme); the migration is parked at `supabase/parked/organizations_branding.sql`, outside `supabase/migrations/` so `db push` cannot apply it. Do not work on
it. Its colour derivation assumed Paper's light surfaces and is not wired to
the CalmSky tokens. Decisions (owner): per organization only, no per-user
themes; oldest membership wins for a user in several orgs; **the owner sets
branding, not customers** (written only via the Supabase dashboard / service
role, no customer-facing settings or org-admin editing). The migration has
**never been run anywhere**; test it on a throwaway Supabase project, never
production first. Wanted for the future, not a launch blocker.

### Android / Google Play (production access granted 2026-10-11)

- Package `com.confidantpm.app`. Closed testing passed; Google granted production
  access 2026-10-11. First production release: version 1.1 (`versionCode` 20; 2 was already used in Play) with the
  CalmSky look. SUBMITTED for review 2026-10-11 (release 1.1 full rollout, worldwide, plus new icon, feature graphic, screenshots). Next: when approved, install from Play and record the store link here.
- **Build (PC):** the CalmSky look is a build-time flag, so the build needs
  `VITE_CALMSKY_REDESIGN=true`. Put it in git-ignored `.env.production.local`
  (without it the bundle ships the old navy theme). Then `npm run build`,
  `npx cap sync android`, `cd android && ./gradlew.bat bundleRelease`. Output:
  `android/app/build/outputs/bundle/release/app-release.aab`. Bump `versionCode` in
  `android/app/build.gradle` for every upload.
- Signing: `android/keystore.properties` (git-ignored) points at
  `E:\confidantpm-release-key.jks`. Back that key up; losing it blocks updates.
- `android/gradle.properties` has a Windows-only `org.gradle.java.home`; keep it
  uncommitted (it would break a Mac build).
- The native app hides "View desktop site" and store badges (`Capacitor.isNativePlatform`).
- Emulator on the PC: Pixel 8 API 37.2 in Android Studio. The Run button can stay
  greyed; `./gradlew.bat assembleDebug` then `adb install -r
  app/build/outputs/apk/debug/app-debug.apk` works.
- **Store listing assets** (`design/play-store/`): `icon-512.png` (full-bleed square),
  `feature-graphic-1024x500.png` (source `feature-graphic.html`), `screenshots/`
  (1080x1920, made with `node design/tools/store-play.mjs <outDir>` against a dev
  server started with `VITE_DEV_BYPASS_AUTH=true VITE_CALMSKY_REDESIGN=true npx vite
  --port 5183`). Upload in Play Console > Grow users > Store presence > Main store listing.

**Open items after Android submit (2026-10-11):**
- Mac synced to the PC's Android work on 2026-10-11 (branch fast-forwarded to origin/main `a2eaac0`). Play 1.1 was submitted with full rollout, so once Google approves (expected 1-4 days) it should go live on its own; if the release page instead shows "ready to publish", the owner clicks publish in Play Console. Back up `E:\confidantpm-release-key.jks`.
- Google Play 1.1 is LIVE (published 2026-10-13, seen in Play Console; listing checked 2026-10-15): https://play.google.com/store/apps/details?id=com.confidantpm.app . The Google Play badge in `AppStoreBadges.jsx` is now a live link ("Now available"), no longer muted. Unused `.app-store-badge-muted` / `-status-soon` CSS is left in `App.css`.
- Play short description reviewed 2026-10-15. Was "The project management assistant that actually knows your project." (66/80); changed to "Project management that knows your project, for independent PMs and agencies." (77/80), submitted for Google review that day. Next: confirm it shows on the live listing.
- "View desktop site" REMOVED from mobile web 2026-10-21 (reverses the 2026-10-12 decision to keep it): the desktop layout squeezed to phone width is a poor representation of the product, so phone-width screens (under 768px) always get the phone layout. The footer link (`MobileDesktopLink.jsx`) is deleted, the phone Settings View Mode picker only shows on a wide screen that desktop Settings put into phone mode (the way back), and `useDeviceMode` ignores a stored `desktop` override on a phone-width screen. Native apps were already hidden. Gantt and other desktop-only views are not reachable on a phone; a phone-friendly read-only Gantt would be separate work.
- **TODO when the owner is home (end of week of 2026-10-21): new iOS and Android builds.** Native apps bundle `dist`, so web changes only reach them on a rebuild and store submission. Pending native-visible changes since the last submitted builds (iOS 1.3 (1), Android 1.1): (1) landscape phones keep the phone layout (`useDeviceMode.js` `MOBILE_QUERY`, 2026-10-21; before it, rotating a phone past 768px wide switched the app to the squeezed desktop layout, in the apps too); (2) the "View desktop site" link and phone View Mode picker removal (already hidden in the apps, so no visible change); (3) the Dashboard welcome tour (desktop layout, so iPad). (4) the 2026-10-23 Professional look and the video walkthrough pop-up (the apps still show the charcoal look, charcoal icons and splash). Bundle these into the next release; follow the iOS build steps above and the Android build notes (bump `versionCode`). Not worth a separate submission on their own. Alternative to the landscape rule if ever wanted: lock iPhone to portrait in `Info.plist`.
- Local-only, uncommitted on the PC: `android/gradle.properties` (Windows JDK path), 5 deleted scratch SQL files, 3 untracked scratch files.
- iOS 1.2 (2) approved and 1.3 (1) live (2026-10-15). Nothing open on iOS.

## Dashboard + All Projects merge (web desktop only) — BUILT and live 2026-10-11

Desktop web only; the mobile `/m/...` routes, iOS and Android are untouched.
`Dashboard.jsx` and `AllProjects.jsx` both render the same `ProjectList` from
the same outlet context, so they were redundant. Decision: one page, the
Dashboard, which is the landing page after login. Approved mockup:
`design/dark/dashboard-topnav.html` (toggles for 3/12 projects and
items/all-caught-up; rendered PNGs in `design/dark/previews/`, uncommitted).

**Layout (top to bottom):**
- **Top navigation, Dashboard only** (project pages keep the left rail; the
  brand links back to the Dashboard as it does now). Top bar = brand, `+ New
  project`, account menu (Sign out). No nav links. Settings and Support are NOT
  in the top bar.
- Greeting + summary line (existing CalmSky copy).
- **AI note** under the greeting: one suggestion at a time, shows its evidence
  ("Based on the project plan and last week's status update"), explicit buttons
  ("Show me options" / "Not now"), says it changes nothing unless the PM asks.
  Source should be a rule-based fact (e.g. a slipped milestone) with the AI
  writing only the wording/options. Source still to be pinned down.
- **Filter row, always shown at any project count:** search first (name or
  goal; reuse `AllProjects.jsx` logic: active matches first, then archived),
  then methodology filter, Active/Archived toggle, sort (Priority / Deadline /
  Recently Updated; default Deadline). Owner's reasoning: a visible search box
  tells users the feature is there when they need it; no threshold logic. No
  `/` keyboard shortcut and no `/` hint in the box.
- Project cards (existing `ProjectList`, with course line + avatars).
- **"Needs your attention" list** below the cards, capped at about 3 items
  ("See all" only if more), time-based facts only, each row links to its
  project (Open): overdue task, milestone passed with open tasks, status update
  overdue by the project's cadence. Must NOT become a risk log or risk-focused
  page. When empty, show "All caught up: nothing needs your attention" as a
  small congratulation.
- **Footer:** Settings, Support, Privacy on the left; "Take ConfidantPM
  anywhere." + App Store badge ("Now available") + muted Google Play badge
  ("Coming soon") on the right, via the existing `AppStoreBadges` component
  (hidden in native builds).

**Behaviour decisions:**
- New users keep the demo projects; if they hide them, that is their action.
  The all-hidden empty state is a rare edge case: "No projects yet" + `+ New
  project`, plus a "Show hidden projects" link if any are hidden.
- Redirect `/projects` to `/dashboard`; remove "All Projects" from the sidebar
  nav; `/projects/:id` routes unchanged.
- Hide-project behaviour (`hideProject` from outlet context) is preserved.

**Data findings (schema check, 2026-10-11):** `tasks.status` has `delayed`
but nothing auto-computes it (PM sets it), so "overdue" must be derived
(not completed and past `due_date`). `document_versions` records accepted
versions only; there is no stored "pending/draft" state for AI proposals
(they appear to be reviewed inside their flows, not verified in the frontend).
`project_collaborators` has pending/accepted for invites only.

**Deliberately deferred:** a pending-proposals inbox (saving unfinished AI
drafts as "pending" so they appear in the list). Bigger build (schema, flows,
RLS); the list layout can take it later without a redo.

**Build status (all pushed to `main` and live, last commit `355a0ad`):**
1. Filter row on `Dashboard.jsx`: search, methodology, Active/Archived and sort on ONE row (wraps when narrow); default sort Deadline. Search box is 340px wide, 14px text. Active/Archived is a two-button switch and sort is a styled `<select>` (Deadline / Priority / Recently Updated; sort hidden on the Archived view). All rules for these are at the end of `App.css`.
   Cards: the Demo badge sits at the right end of the "Target Go Live" row (`.project-card-foot` in `ProjectList.jsx`) so titles keep the header row and cards line up; the card grid is `auto-fit` so the row ends at the same right edge as the attention list, and a lone card is capped (`max-width: 480px` + padding). Full project name on hover (`title`). `AllProjects.jsx` deleted.
2. Top bar + footer: `AppShell` takes `topNav`, turned on by `ProjectsShell` for `/dashboard` only. `TopBar` and `PageFooter` live in `AppShell.jsx`; styles at the end of `App.css`.
3. "Needs your attention": `src/needsAttention.js` (pure rules), `components/NeedsAttention.jsx`. Rules: target go-live date passed; overdue tasks (grouped per project); milestone past with open tasks; status update overdue by the project's Status Update row in `comm_plan_items` (Ad hoc skipped; if none was ever sent the row says "No status update sent yet; the plan was set up N days ago", counted from the plan row's `created_at`). Sorted most overdue first, max 3 shown, "See all N". The item the AI note already says is left out while the note shows (`hideKeys`) and returns when the note is dismissed. Demo projects are skipped once the user has any real project (`attentionProjects`).
4. AI note: **removed from the Dashboard 2026-10-11** (it duplicated the attention list and had only templated wording, no real AI). The code is kept for when real AI wording exists: `components/AiNote.jsx` and `computeAiNoteFact` in `needsAttention.js` (slipped milestone, else top attention item; dismissal in localStorage `dashboard-ai-note-dismissed`). To bring it back, render `AiNote` in `Dashboard.jsx` under the greeting, hold the dismissed list there, and pass `hideKeys={[fact.covers]}` to `NeedsAttention` so the list does not repeat it. `NeedsAttention` still accepts `hideKeys`; `useAttentionData` is shared by the list.
5. Demo projects hide on the Dashboard once there are 3 or more real projects on it (non-demo, not archived; `DEMO_HIDE_AT` in `Dashboard.jsx`). Display only. A "Show demo projects (N)" / "Hide demo projects" link sits under the cards, search still finds demos, and the "N active projects" line follows what is displayed. Archiving a real project can bring demos back (by design). Separate from this, the attention list and AI note skip demos once there is any 1 real project.
6. `/projects` redirects to `/dashboard`; "All Projects" removed from the rail; project pages' back link goes to `/dashboard`. Mobile untouched.

**Still open:**
- AI note is off the Dashboard; if it returns it needs real AI-written wording and options (would need an Edge Function; deploy, JWT setting and per-view API cost to weigh).
- Checked 2026-10-12 in the dev preview (fixtures forced, then reverted): "See all N" expands to every item and flips to "Show fewer"; the all-caught-up row renders cleanly. Not tested: the demo-only case, blocked localStorage, and the Account menu's Escape / click-outside close. The `devFixtures.js` sample data now has a slipped milestone, a weekly status plan and an old status update so the note and list render in the preview.
- Pending-proposals inbox stays deferred.

**Vercel deploy gotcha (2026-10-11):** two pushes in a row failed within ~3 seconds with "Git information retrieval failed for this deployment" (Vercel could not read commit info from GitHub; not a code or build error, `vite build` passed locally). Clicking Redeploy in the Vercel dashboard fixed it and the next push deployed normally. If it recurs: Redeploy first, then Project Settings > Git (reconnect the GitHub repo). The Vercel build log needs a dashboard login; the `vercel` CLI is not logged in on the Mac. Vercel can also lag 5-40 minutes before a push starts building.


## Product tour and "See how it works" (live 2026-10-21)

- **Dashboard welcome tour** (`components/WelcomeTour.jsx`, desktop Dashboard only): six spotlight steps targeting `data-tour` attributes on the Dashboard and top bar. Opens once per browser when the Dashboard has loaded and localStorage `cpm_welcome_tour_seen` is not `1`; Skip, Done and Esc set it. Replay from Account menu > Take the tour. Browser-based, not per account (owner is fine with this; a per-account version would need a migration).
- **Home page "See how it works"**: a button in the hero and the footer opens `components/HowItWorksModal.jsx`, a five-slide pop-up over the marketing page with a sign-up button on every slide, so visitors never leave the page. The slides live in `tourSteps.js`, with screenshots in `src/assets/tour/` (captured from the dev preview sample data), and are shared with the standalone `/tour` page (`Tour.jsx`, in the sitemap, no longer linked from the home page). `/tour` is not prerendered.
- **Video walkthrough (2026-10-23):** each of the five steps now has a silent 13-20s clip (`src/assets/tour/<name>.mp4` + `.webm`, scripted recordings of the dev preview sample data, ~73s total, wired in `tourSteps.js`, played by `components/TourMedia.jsx`). The pop-up plays them back to back with no clicks (progress bar segments fill, tap to pause, segments jump, Back/Next/Watch again remain); `/tour` loops each clip while on screen; reduced-motion visitors get the stills. Callout bubbles (real text, timed to each clip, positioned as % of the frame) come from `src/assets/tour/<name>.callouts.json`, written by the recorder; the wording can be edited in those files. Clips are stretched 1.1x (`SLOW` in `rec-lib.cjs` / `cut.py`, keep equal). Re-record after UI changes with `design/tools/tour-clips/` (see the header of `record.cjs`); the poster screenshots (`.jpg`) are separate. The recorder needs ffmpeg (libx264, libvpx-vp9), numpy and Playwright's Chromium; that Chromium cannot play H.264, so verify clips there via the webm and on a real device for mp4. Owner verified playback on iPad 2026-10-23 and approved the result.
- Parked: a written getting-started guide (desktop draft exists as a Claude Doc). No phone-version tour planned.

## Next session: open items and working notes (written 2026-10-23)

Where things stand: `main` (commit `ba42217` at time of writing) has the Professional
theme and the auto-playing video walkthrough, both live and approved by the owner.
The cloud branch `claude/wizardly-edison-2lh78h` mirrors `main`; start new work from
`main`.

**Open, roughly in priority order:**
1. Check the new look on screens not yet covered: phone `/m/...` screens, Comms
   "document" pages, login/marketing on a phone, and hunt for leftover hard-coded dark
   colours (`design/tools/shoot.mjs` does phone screenshots plus a colour scan).
2. New iOS and Android builds (see the TODO under Android above): they still carry the
   charcoal look, icons and splash. Regenerate icons/splash if the logo tile changes.
3. Redo the App Store and Play Store screenshots in the new look
   (`design/tools/store.mjs`, `store-ipad.mjs`, `store-play.mjs`).
4. Tidy older CalmSky notes in this file that describe the charcoal theme as current
   (the sections are marked superseded, not rewritten).
5. `public/og-image.png`, `design/dark/*` mock-ups and the logo files still show the
   old look; update if the owner wants them to match.
6. Possible follow-ups the owner floated: a real suggested-answer example in the Q&A
   walkthrough clip (the dev sample data produces no ghost-text suggestion), and a
   shorter walkthrough if 73s feels long.

**Working notes:**
- The owner is often on an iPad and cannot run npm or open files: show screenshots or
  short clips, send files directly, and push to `main` only when told to.
- `npm install` rewrites `package-lock.json`; do not commit that change.
- Preview: `VITE_DEV_BYPASS_AUTH=true VITE_CALMSKY_REDESIGN=true npx vite --port 5183`.
  A full local build needs dummy `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` for the
  prerender step (`npm run build`).
- Vercel can lag 5-40 minutes or fail with "Git information retrieval failed": click
  Redeploy. If the owner reports a change "not showing", check that first, then
  browser cache (close and reopen the tab).
- To change walkthrough wording only, edit `src/assets/tour/*.callouts.json` or
  `src/tourSteps.js`; no re-recording needed. To change what the clips show, edit
  `design/tools/tour-clips/record.cjs` and re-run it plus `cut.py`.
