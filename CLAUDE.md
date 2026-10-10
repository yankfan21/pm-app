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


## CalmSky_Redesign and white-label branding — status as of 2026-10-09

Work lives on branch `claude/wonderful-lovelace-7l64oi` (a git worktree at
`~/pm-app-redesign`). Everything is behind `VITE_CALMSKY_REDESIGN=true`; with
it unset the shipped navy theme is unchanged. **Launch timing is the owner's
call: a new prod version ships when they decide. Do not merge, push or deploy
the redesign unprompted.** Local commits are fine; ask before pushing. Never
run the branding migration against production.

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

**Done (all committed locally, nothing pushed):** Gantt critical path now muted amber `#d98f2b` with a 2.5px ring (set under calmsky only; legend arrow follows), mobile delete-account modal scanned clean on 2026-10-10 via a dev-only canned `delete-account` preview in `src/dev/devSupabase.js` (execute stays disabled), tokens, logo mark, shell and
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
- No real-device or simulator check of the mobile app yet (only headless
  Chrome emulation).
- Not covered by the 2026-10-10 hover/focus/modal crawl (`design/tools/`): states that
  only appear after other interactions, and the dashboard AI note / waiting
  list (not built).
- Known leftovers that are harmless: `.revision-preview` navy tint (6%),
  `.mobile-metrics-card` slate border under `data-theme='dark'` (never applies
  under calmsky). Shipped-theme CSS bugs found along the way (fixed only under
  calmsky, deliberately): `.mobile-doc-row` content-box overflow, risk-card
  fields with a transparent border (`.risk-cell-input` beats
  `.risk-card-textarea`). Worth fixing in the shipped CSS at launch.
- `index.html` `theme-color` and `public/manifest.json` `background_color` /
  `theme_color` are still navy `#1a2130` (affects the browser/status bar, so
  prod-visible); change at launch together with the icons.
- Live favicon/PNG icons/manifest in `public/` are untouched (would change
  prod); re-export from `design/logo/icon-tile.svg` at launch. No outlined
  wordmark file yet.
- Not built because there is no data behind it: the dashboard AI note and
  "Waiting for your decision" list (needs a product decision on what the AI
  flags / what counts as pending); a late-milestone state (milestones have no
  done/late field, so the course line only shows passed vs upcoming by date).
- Health is shown only in the status badge now (amber/red card bars removed).
- Agile zone indigo (`--agile-accent`) and the document-preview indigo
  (`--paper-accent`) were deliberately kept.
- Unresolved from earlier: after "Switch to Hybrid" in Project Discovery the
  header methodology badge still showed Waterfall; unconfirmed whether that is
  stale state in the real app or just the dev fake (`ScopingFlow.jsx` writes
  `projects.methodology` but nothing tells the parent to refresh).
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

### White-label branding (PARKED)

Code, migration and `BRANDING.md` stay on the branch, inert; do not work on
it. Its colour derivation assumed Paper's light surfaces and is not wired to
the CalmSky tokens. Decisions (owner): per organization only, no per-user
themes; oldest membership wins for a user in several orgs; **the owner sets
branding, not customers** (written only via the Supabase dashboard / service
role, no customer-facing settings or org-admin editing). The migration has
**never been run anywhere**; test it on a throwaway Supabase project, never
production first. Wanted for the future, not a launch blocker.
