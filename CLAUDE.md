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


## Redesign ("Paper" theme) and white-label branding — status as of 2026-10-09

Work lives on branch `claude/wonderful-lovelace-7l64oi`. Everything is behind
`VITE_REDESIGN=true`; with it unset the shipped theme is unchanged. **Launch
timing is the owner's call: a new prod version ships when they decide. Do not
merge, push or deploy the redesign unprompted.** Local commits are fine; ask
before pushing.

Local preview: `.env.local` (git-ignored) with `VITE_DEV_BYPASS_AUTH=true` and
`VITE_REDESIGN=true`, then `npm run dev`. The bypass swaps in an in-memory fake
Supabase (`src/dev/`) with sample data; it only works when `import.meta.env.DEV`
is true, so it can never be on in a production build. Add `VITE_DEV_ORG=true` to
preview a sample branded organization.

**Done:** token foundation, Paper shell/nav, project lists, Q&A flows, Gantt,
marketing and public screens, desktop walkthrough fixes (phase note size, sprint
board controls). Branding layer: `src/branding/color.js` (contrast-safe token
derivation; run `node --test src/branding/color.test.js`, a directory argument
fails on Node 24), `src/branding/BrandingContext.jsx` (loads the user's org and
sets `--brand-*` variables), Paper tokens read them with the teal fallback,
sidebar shows the org app name/logo and hides ConfidantPM's store badges when
branded. With no org (or no migration applied) the app looks exactly like stock.

**Branding decisions (owner):**
- Per organization only. No per-user themes. A user in several orgs gets the
  oldest membership's branding (no switcher yet).
- **The owner sets branding, not customers.** No customer-facing branding
  settings screen and no org-admin editing. Branding is written only by the
  owner through the Supabase dashboard (SQL editor + Storage page) / service
  role.
- Wanted for the future, not a launch blocker.

**Next steps, in order:**
1. Tighten `supabase/migrations/organizations_branding.sql` to match: remove the
   org-admin UPDATE policy, the column-level UPDATE grant, the admin logo
   upload/update/delete storage policies, `is_org_admin`, and the `role` column
   on `organization_members`. Keep member read-only access and the validation
   checks. The migration is reviewed but has **never been run anywhere**; test it
   on a throwaway Supabase project, never production first.
2. Write `BRANDING.md`: copy-paste SQL to create an org, add users, set
   name/colors, plus how to upload a logo (bucket `org-logos`, path
   `{organization_id}/{filename}`, png/jpeg/webp, max 1 MB).
3. Still unchecked: Project Discovery Q&A flow, mobile screens beyond the
   dashboard. Paper is light-only (no dark mode). Dev fixtures list
   `dev-bypass-user` twice in the assignee dropdown (duplicate React key
   warning); confirm the real app can't do the same.
4. Not built (add only if wanted): browser tab title/favicon per org, branded
   login/marketing pages, branding in emails and PDF/Word exports.
