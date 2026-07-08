-- PHASE 1 of the auth/access-control rollout. Purely additive - nothing
-- currently deployed changes behavior after running this. Run this first,
-- before deploying any of the new frontend auth code.
--
-- Adds:
--   - projects.owner_id (nullable for now - no existing project has an
--     owner yet; tightened to NOT NULL in the phase3 migration after a
--     one-time manual backfill)
--   - project_collaborators (project_id, user_id, role, invited_by)
--   - three security-definer helper functions used by every table's real
--     RLS policies in phase4 (is_project_owner / has_project_access /
--     can_edit_project) - security definer so they can read `projects` and
--     `project_collaborators` without recursing back through those same
--     tables' own RLS policies
--   - find_user_id_by_email(text) RPC, so the "invite by email" UI can
--     resolve an email to a user id without exposing a queryable table of
--     every registered user's email (a plain "profiles table readable by
--     any authenticated user" would let any signed-in user enumerate every
--     account in the app - this function returns one id for one exact
--     email, nothing else, and doesn't need a new table at all)
--   - a temporary, fully-open "authenticated" policy on every existing
--     table, alongside (not replacing) the existing anon one. Once phase2
--     ships real logins, requests run as the `authenticated` role, which
--     today matches NO policy at all (every existing policy is scoped
--     `to anon` only) - without this temporary policy, signing in would
--     immediately break access for everyone before the real per-project
--     policies exist. Phase4 drops this again once the real policies land.

alter table projects add column if not exists owner_id uuid references auth.users(id);

create table if not exists project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalized at invite time (resolved via find_user_id_by_email below)
  -- so the access-management UI can show who has access without needing
  -- any broader "look up any user's email" capability - the alternative
  -- (a profiles table readable by any authenticated user) would let anyone
  -- signed in enumerate every registered email in the app, which this
  -- avoids entirely. Can go stale if the collaborator later changes their
  -- email; acceptable for a v1 collaborator list.
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists project_collaborators_project_user_key
  on project_collaborators (project_id, user_id);

alter table project_collaborators enable row level security;

drop policy if exists "authenticated full access (temporary)" on project_collaborators;
create policy "authenticated full access (temporary)" on project_collaborators
  for all
  to authenticated
  using (true)
  with check (true);

-- Helper functions ------------------------------------------------------

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects where id = p_project_id and owner_id = auth.uid()
  );
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_project_owner(p_project_id)
    or exists (
      select 1 from project_collaborators
      where project_id = p_project_id and user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_project_owner(p_project_id)
    or exists (
      select 1 from project_collaborators
      where project_id = p_project_id and user_id = auth.uid() and role = 'editor'
    );
$$;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where email = p_email limit 1;
$$;

grant execute on function public.is_project_owner(uuid) to authenticated;
grant execute on function public.has_project_access(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;
grant execute on function public.find_user_id_by_email(text) to authenticated;

-- Temporary open "authenticated" policy on every existing table ---------
-- (kept alongside the existing anon policy - both removed together in phase4)

drop policy if exists "authenticated full access (temporary)" on projects;
create policy "authenticated full access (temporary)" on projects
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on tasks;
create policy "authenticated full access (temporary)" on tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on charters;
create policy "authenticated full access (temporary)" on charters
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on requirements_briefs;
create policy "authenticated full access (temporary)" on requirements_briefs
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on risk_logs;
create policy "authenticated full access (temporary)" on risk_logs
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on exec_comms_plans;
create policy "authenticated full access (temporary)" on exec_comms_plans
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on team_newsletters;
create policy "authenticated full access (temporary)" on team_newsletters
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on budget_trackers;
create policy "authenticated full access (temporary)" on budget_trackers
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on status_updates;
create policy "authenticated full access (temporary)" on status_updates
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on document_versions;
create policy "authenticated full access (temporary)" on document_versions
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on post_mortems;
create policy "authenticated full access (temporary)" on post_mortems
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access (temporary)" on project_evaluations;
create policy "authenticated full access (temporary)" on project_evaluations
  for all to authenticated using (true) with check (true);
