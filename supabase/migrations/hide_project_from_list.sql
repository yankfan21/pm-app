-- Adds a per-user "hide from my list" flag for any project the current
-- user has access to via project_collaborators (NOT for owned projects -
-- see set_collaborator_project_hidden below for why that's out of scope).
-- Lives on the collaborator row, not the project itself, so hiding is
-- purely personal: it doesn't touch project data, doesn't affect any other
-- collaborator's view of the project, and doesn't touch role/permissions.
--
-- Also safe against the demo nightly reset: demo_projects_nightly_reset.sql
-- already deliberately leaves project_collaborators completely untouched
-- (see that file's header comment - "this is who has access, not project
-- content"), so a hidden demo project stays hidden across every nightly
-- restore too, with no extra work needed here.

alter table project_collaborators add column if not exists hidden boolean not null default false;
alter table project_collaborators add column if not exists hidden_at timestamptz;

-- RPC rather than a direct UPDATE from the frontend: the existing "owner
-- can update collaborators" RLS policy (phase4_full_lockdown_no_anon.sql)
-- only lets the project OWNER update a project_collaborators row - exactly
-- backwards for this feature, where it's the collaborator themselves (not
-- the owner) who needs to flip their own hidden flag. Rather than add a
-- second UPDATE policy plus a trigger to stop a collaborator from also
-- rewriting their own role/email through that same door, this follows the
-- same security-definer pattern already used by is_project_owner /
-- has_project_access / find_user_id_by_email (phase1) and
-- grant_demo_project_access (demo_projects_auto_access.sql): one narrow
-- function that can only ever touch the caller's own row - `where
-- user_id = auth.uid()` is baked into the query, never passed in as an
-- argument - and only ever touches hidden/hidden_at.
--
-- Owned projects have no project_collaborators row for their own owner
-- (owner_id on `projects` is the access mechanism there, see
-- phase1_access_control_schema.sql), so this simply has nothing to match
-- and raises for an owner calling it on their own project - by design,
-- matching the ask that this only apply to projects the user collaborates
-- on, not ones they own.
create or replace function public.set_collaborator_project_hidden(
  p_project_id uuid,
  p_hidden boolean
)
returns project_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  result project_collaborators;
begin
  update project_collaborators
  set hidden = p_hidden,
      hidden_at = case when p_hidden then now() else null end
  where project_id = p_project_id
    and user_id = auth.uid()
  returning * into result;

  if result.id is null then
    raise exception 'No collaborator access found for this project - nothing to hide/unhide.';
  end if;

  return result;
end;
$$;

grant execute on function public.set_collaborator_project_hidden(uuid, boolean) to authenticated;

-- ============================================================
-- Verification
-- ============================================================

-- 1. Confirm both columns exist:
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'project_collaborators' and column_name in ('hidden', 'hidden_at');
-- expect 2 rows: hidden (boolean, default false), hidden_at (timestamptz, no default)

-- 2. Confirm the function exists as SECURITY DEFINER:
select routine_name, security_type
from information_schema.routines
where routine_name = 'set_collaborator_project_hidden';
-- expect security_type = 'DEFINER'

-- 3. NOTE: the RPC itself can't be meaningfully tested from the SQL editor
--    the way the earlier trigger test was - it reads auth.uid(), which is
--    NULL when a query runs as the `postgres` role from the dashboard
--    (there's no real user session backing it), so calling it here would
--    just hit the "No collaborator access found" exception every time
--    regardless of whether the code is correct. That's expected, not a
--    bug. Once the frontend hide button ships, the real end-to-end test is
--    signing in as an actual collaborator (e.g. on one of the 3 demo
--    projects) and using it from the UI.
--
--    If you want to sanity-check the columns behave correctly independent
--    of auth, you can toggle a row directly as postgres (bypasses RLS same
--    as the RPC does, just without the auth.uid() scoping) - replace both
--    placeholders with a real project_id/user_id pair from a query like
--    `select project_id, user_id from project_collaborators limit 5;`:
--
--   update project_collaborators set hidden = true, hidden_at = now()
--     where project_id = '<project-id>' and user_id = '<user-id>';
--   select project_id, user_id, hidden, hidden_at from project_collaborators
--     where project_id = '<project-id>' and user_id = '<user-id>';
--   update project_collaborators set hidden = false, hidden_at = null
--     where project_id = '<project-id>' and user_id = '<user-id>';
