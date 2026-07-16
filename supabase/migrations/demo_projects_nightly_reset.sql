-- Phase D: nightly snapshot/restore for the 3 shared demo projects
-- (Customer Portal Redesign, Loyalty Rewards Mobile App, Regional Expansion
-- Rollout - selected via `projects.is_demo = true`, not hardcoded ids, per
-- the flag demo_projects_auto_access.sql already added for this purpose).
--
-- Every night, pg_cron calls restore_demo_projects(), which wipes and
-- reinserts every row scoped to the 3 demo projects across every table
-- below, and resets the projects row's own editable columns
-- (name/goal/priority/deadline/methodology/status) - everything users can
-- change during the day snaps back to the last captured baseline.
--
-- Deliberately NOT touched: project_collaborators (per requirement - this
-- is who has access, not project content; the auto-collaborator trigger in
-- demo_projects_auto_access.sql stays untouched and doesn't need to redo
-- anything), and projects.id/owner_id/is_demo/created_at (structural, not
-- content - owner_id must stay the system account, is_demo must stay true).
--
-- IMPORTANT - running this file for the first time:
-- the last statement below calls capture_demo_snapshot(), which captures
-- the CURRENT live state of the 3 demo projects as the baseline every
-- future nightly restore snaps back to. Get the demo data into the state
-- you want it to reset to BEFORE running this file. If you ever want to
-- bake in a new baseline later (e.g. after manually polishing demo
-- content), just run `select public.capture_demo_snapshot();` again by
-- itself - it always overwrites the previous baseline.
--
-- Table scope (audited against the live schema and every `.from(...)` call
-- in src/, not just the original ask):
--   direct project_id FK: tasks, charters, requirements_briefs, risk_logs,
--     exec_comms_plans, team_newsletters, budget_trackers, status_updates,
--     document_versions, post_mortems, project_evaluations, milestones,
--     sprints
--   indirect: sprint_retros (-> sprint_id -> sprints.project_id, no
--     project_id column of its own - same join every RLS policy on this
--     table already uses)
--   projects itself: editable columns only (see above), via UPDATE not
--     delete/reinsert, since the row must persist throughout
--
-- Snapshot storage: one shadow table per source table, created with
-- `LIKE source_table INCLUDING DEFAULTS` - this reads the column list
-- straight from the catalog (needed for charters/tasks/projects, which
-- predate this migrations folder and have no CREATE TABLE on file here),
-- and deliberately excludes source tables' own FK/PK/unique constraints so
-- a frozen snapshot row is never blocked by today's live constraints.
-- Consequence relied on below: `INSERT INTO x SELECT * FROM x_demo_snapshot`
-- fails loudly (column count/type mismatch) if x's schema ever changes
-- without updating its snapshot table - preferred over a generic JSONB blob
-- silently dropping a column nobody remembered to add.
--
-- No RLS policies are added on the snapshot tables (RLS is enabled with an
-- implicit deny-all to anon/authenticated - nothing in the app should ever
-- read these directly). Both functions below run as the function owner
-- (postgres, since this is pasted into the SQL editor) which bypasses RLS
-- as a superuser, and pg_cron jobs scheduled from the SQL editor run as
-- that same role.

-- ── snapshot tables ─────────────────────────────────────────────────────

create table if not exists projects_demo_snapshot (like projects including defaults);
create table if not exists milestones_demo_snapshot (like milestones including defaults);
create table if not exists sprints_demo_snapshot (like sprints including defaults);
create table if not exists tasks_demo_snapshot (like tasks including defaults);
create table if not exists sprint_retros_demo_snapshot (like sprint_retros including defaults);
create table if not exists charters_demo_snapshot (like charters including defaults);
create table if not exists requirements_briefs_demo_snapshot (like requirements_briefs including defaults);
create table if not exists risk_logs_demo_snapshot (like risk_logs including defaults);
create table if not exists exec_comms_plans_demo_snapshot (like exec_comms_plans including defaults);
create table if not exists team_newsletters_demo_snapshot (like team_newsletters including defaults);
create table if not exists budget_trackers_demo_snapshot (like budget_trackers including defaults);
create table if not exists status_updates_demo_snapshot (like status_updates including defaults);
create table if not exists document_versions_demo_snapshot (like document_versions including defaults);
create table if not exists post_mortems_demo_snapshot (like post_mortems including defaults);
create table if not exists project_evaluations_demo_snapshot (like project_evaluations including defaults);

alter table projects_demo_snapshot enable row level security;
alter table milestones_demo_snapshot enable row level security;
alter table sprints_demo_snapshot enable row level security;
alter table tasks_demo_snapshot enable row level security;
alter table sprint_retros_demo_snapshot enable row level security;
alter table charters_demo_snapshot enable row level security;
alter table requirements_briefs_demo_snapshot enable row level security;
alter table risk_logs_demo_snapshot enable row level security;
alter table exec_comms_plans_demo_snapshot enable row level security;
alter table team_newsletters_demo_snapshot enable row level security;
alter table budget_trackers_demo_snapshot enable row level security;
alter table status_updates_demo_snapshot enable row level security;
alter table document_versions_demo_snapshot enable row level security;
alter table post_mortems_demo_snapshot enable row level security;
alter table project_evaluations_demo_snapshot enable row level security;

-- ── capture_demo_snapshot() ─────────────────────────────────────────────
-- Overwrites every snapshot table with the CURRENT state of the 3 demo
-- projects. Run manually (see bottom of this file) whenever you want to
-- bake in a new "clean" baseline - never scheduled, only restore is.

create or replace function public.capture_demo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'capture_demo_snapshot: no rows in projects where is_demo = true';
  end if;

  truncate
    projects_demo_snapshot, milestones_demo_snapshot, sprints_demo_snapshot,
    tasks_demo_snapshot, sprint_retros_demo_snapshot, charters_demo_snapshot,
    requirements_briefs_demo_snapshot, risk_logs_demo_snapshot,
    exec_comms_plans_demo_snapshot, team_newsletters_demo_snapshot,
    budget_trackers_demo_snapshot, status_updates_demo_snapshot,
    document_versions_demo_snapshot, post_mortems_demo_snapshot,
    project_evaluations_demo_snapshot;

  insert into projects_demo_snapshot select * from projects where id = any(demo_ids);
  insert into milestones_demo_snapshot select * from milestones where project_id = any(demo_ids);
  insert into sprints_demo_snapshot select * from sprints where project_id = any(demo_ids);
  insert into tasks_demo_snapshot select * from tasks where project_id = any(demo_ids);

  insert into sprint_retros_demo_snapshot
    select sr.* from sprint_retros sr
    join sprints s on s.id = sr.sprint_id
    where s.project_id = any(demo_ids);

  insert into charters_demo_snapshot select * from charters where project_id = any(demo_ids);
  insert into requirements_briefs_demo_snapshot select * from requirements_briefs where project_id = any(demo_ids);
  insert into risk_logs_demo_snapshot select * from risk_logs where project_id = any(demo_ids);
  insert into exec_comms_plans_demo_snapshot select * from exec_comms_plans where project_id = any(demo_ids);
  insert into team_newsletters_demo_snapshot select * from team_newsletters where project_id = any(demo_ids);
  insert into budget_trackers_demo_snapshot select * from budget_trackers where project_id = any(demo_ids);
  insert into status_updates_demo_snapshot select * from status_updates where project_id = any(demo_ids);
  insert into document_versions_demo_snapshot select * from document_versions where project_id = any(demo_ids);
  insert into post_mortems_demo_snapshot select * from post_mortems where project_id = any(demo_ids);
  insert into project_evaluations_demo_snapshot select * from project_evaluations where project_id = any(demo_ids);
end;
$$;

revoke all on function public.capture_demo_snapshot() from public, anon, authenticated;

-- ── restore_demo_projects() ─────────────────────────────────────────────
-- The nightly job. One transaction (a plpgsql function body is atomic by
-- default - any exception anywhere below rolls back everything, including
-- the deletes). Refuses to run if the baseline looks missing/stale rather
-- than silently wiping a demo project to empty.

create or replace function public.restore_demo_projects()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'restore_demo_projects: no rows in projects where is_demo = true - refusing to run';
  end if;

  -- Guards the case where a demo project was added/removed since the last
  -- capture: without this, a never-captured demo project would get its
  -- live rows deleted below and nothing reinserted (empty snapshot).
  if (select count(*) from projects_demo_snapshot where id = any(demo_ids)) <> array_length(demo_ids, 1) then
    raise exception 'restore_demo_projects: is_demo project set does not match projects_demo_snapshot - run capture_demo_snapshot() first';
  end if;

  -- delete: children before parents
  delete from sprint_retros where sprint_id in (select id from sprints where project_id = any(demo_ids));
  delete from tasks where project_id = any(demo_ids);
  delete from milestones where project_id = any(demo_ids);
  delete from sprints where project_id = any(demo_ids);
  delete from charters where project_id = any(demo_ids);
  delete from requirements_briefs where project_id = any(demo_ids);
  delete from risk_logs where project_id = any(demo_ids);
  delete from exec_comms_plans where project_id = any(demo_ids);
  delete from team_newsletters where project_id = any(demo_ids);
  delete from budget_trackers where project_id = any(demo_ids);
  delete from status_updates where project_id = any(demo_ids);
  delete from document_versions where project_id = any(demo_ids);
  delete from post_mortems where project_id = any(demo_ids);
  delete from project_evaluations where project_id = any(demo_ids);

  -- reinsert: parents before children
  insert into milestones select * from milestones_demo_snapshot;
  insert into sprints select * from sprints_demo_snapshot;

  -- tasks.depends_on is a non-deferrable self-referencing FK, which raised
  -- a "permission denied: RI_ConstraintTrigger... is a system trigger"
  -- error the first time this was tested - Supabase's `postgres` role
  -- isn't a true superuser, and ALTER TABLE ... DISABLE TRIGGER ALL (an
  -- earlier version of this function used that to work around the FK) is
  -- superuser-only when it reaches the internal RI trigger, even inside a
  -- SECURITY DEFINER function. Turns out that workaround was never needed
  -- anyway: NOT DEFERRABLE only fixes a constraint to IMMEDIATE mode, and
  -- IMMEDIATE means "checked at end of statement," not "checked after each
  -- row." A single INSERT ... SELECT loading every task in one statement
  -- has every row already present by the time that end-of-statement check
  -- runs, so self-references between rows inserted by this same statement
  -- are valid regardless of SELECT *'s row order - no trigger juggling
  -- required. (Would NOT be safe to split this into one INSERT per row.)
  insert into tasks select * from tasks_demo_snapshot;

  insert into sprint_retros select * from sprint_retros_demo_snapshot;
  insert into charters select * from charters_demo_snapshot;
  insert into requirements_briefs select * from requirements_briefs_demo_snapshot;
  insert into risk_logs select * from risk_logs_demo_snapshot;
  insert into exec_comms_plans select * from exec_comms_plans_demo_snapshot;
  insert into team_newsletters select * from team_newsletters_demo_snapshot;
  insert into budget_trackers select * from budget_trackers_demo_snapshot;
  insert into status_updates select * from status_updates_demo_snapshot;
  insert into document_versions select * from document_versions_demo_snapshot;
  insert into post_mortems select * from post_mortems_demo_snapshot;
  insert into project_evaluations select * from project_evaluations_demo_snapshot;

  -- projects row itself: editable content columns only. id/owner_id/
  -- is_demo/created_at are never touched.
  update projects p
  set name = s.name,
      goal = s.goal,
      priority = s.priority,
      deadline = s.deadline,
      methodology = s.methodology,
      status = s.status,
      updated_at = s.updated_at
  from projects_demo_snapshot s
  where p.id = s.id;
end;
$$;

revoke all on function public.restore_demo_projects() from public, anon, authenticated;

-- ── schedule ─────────────────────────────────────────────────────────────
-- 08:00 UTC daily - adjust the cron expression to whatever local overnight
-- time you actually want before running this file (pg_cron times are UTC,
-- not your local timezone). Idempotent: unschedules any existing job of
-- the same name first, so this file can be re-run safely if you change the
-- schedule later.

select cron.unschedule(jobid) from cron.job where jobname = 'nightly-demo-reset';

select cron.schedule(
  'nightly-demo-reset',
  '0 8 * * *',
  $$select public.restore_demo_projects();$$
);

-- ── establish the initial baseline ────────────────────────────────────────
-- Captures the CURRENT state of the 3 demo projects as the reset point.
-- Make sure the demo data is in the state you want before running this
-- file - this line is what locks it in.

select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select jobname, schedule, active from cron.job where jobname = 'nightly-demo-reset';
--
--   select (select count(*) from tasks_demo_snapshot) as tasks,
--          (select count(*) from milestones_demo_snapshot) as milestones,
--          (select count(*) from sprints_demo_snapshot) as sprints;
--
-- To test restore immediately without waiting for the schedule:
--   select public.restore_demo_projects();
