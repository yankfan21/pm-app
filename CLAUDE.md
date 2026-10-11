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

## CalmSky_Redesign and white-label branding — status as of 2026-10-10

**LIVE as of 2026-10-10.** The redesign was merged to `main` (fast-forward) and
pushed with the owner's approval; `VITE_CALMSKY_REDESIGN=true` is now set in
Vercel Production, so confidantpm.com shows the CalmSky look. Latest pushed
commit `b10a40e` (dashboard cards: Target Go Live on its own row). To roll the
theme back, remove that Vercel env var and redeploy (the shipped navy theme is
still in the code). Work was developed on branch `claude/wonderful-lovelace-7l64oi`
(git worktree `~/pm-app-redesign`). Going forward the standing rule is the
usual one: ask before pushing or deploying anything. Never run the branding
migration against production.

The earlier light "Paper" theme was removed (commit 5dccf96). The owner
rejected light themes (tinted looked dirty, white stark), purple/magenta, ice
white, glows and heavy effects, and the bold palettes.

**Decided look ("Friendly" dark, Calm Sky accent):** warm charcoal base
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
