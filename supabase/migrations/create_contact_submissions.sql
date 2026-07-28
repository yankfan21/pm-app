-- Run this in the Supabase SQL editor to add the Contact Support form.
--
-- contact_submissions is not project-scoped - it's a per-user support
-- request (Name/Email typed in the form, Contact Reason, Message), so this
-- goes straight to the authenticated-only shape (no project_id, no
-- has_project_access()/can_edit_project() helpers - those are for
-- project_id-scoped tables only, see issue_logs.sql). Written after Phase 4's
-- full lockdown (phase4_full_lockdown_no_anon.sql) already shipped, so no
-- anon/unclaimed carve-out either.
--
-- No SELECT policy yet - submissions are reviewed via the Supabase table
-- editor (elevated access, bypasses RLS), not from within the app. Add a
-- SELECT policy later if an in-app admin view ever gets built.

create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  email text not null,
  contact_reason text not null check (contact_reason in ('Technical Issue', 'Subscription', 'General Inquiry')),
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'resolved')),
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

drop policy if exists "users can insert their own contact submissions" on contact_submissions;

create policy "users can insert their own contact submissions" on contact_submissions
  for insert to authenticated with check (auth.uid() = user_id);
