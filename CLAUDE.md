# Projist — orientation

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
- Live URL: pm-app-tau-seven.vercel.app
- Email: Resend (signed up, not yet integrated)
- Document parsing: mammoth (for .docx Charter uploads)

## Workflow
- Straight-to-main commits. Vercel auto-deploys on push. No PR process.
- SQL migrations: write to a file and give Scott the exact path — he runs
  them manually via Supabase SQL editor (click Run, not Ctrl+Enter). Claude
  Code has no direct Supabase dashboard access.
- Edge Functions: deployed via dashboard paste by Scott. JWT verification
  must be manually disabled per new Edge Function in Supabase Settings.
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

