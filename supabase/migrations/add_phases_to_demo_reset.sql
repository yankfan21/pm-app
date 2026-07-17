-- Extends the Phase D nightly demo reset (demo_projects_nightly_reset.sql)
-- to cover the new phases table (phases_schema.sql). Without this, phases
-- would be the one piece of demo-project content the nightly reset doesn't
-- snap back - a visitor toggling a demo project's Execution phase to
-- Custom dates would have that change persist forever instead of resetting
-- with everything else. Run this AFTER phases_schema.sql.
--
-- Same shadow-table approach as every other table in
-- demo_projects_nightly_reset.sql: `like phases including defaults`. Note
-- that "including defaults" does NOT carry over generated columns'
-- generation expressions - a plain, ordinary column of the same name and
-- type is created instead (see PG docs on LIKE ... INCLUDING GENERATED,
-- which is NOT specified here). That's fine for the capture leg (reading a
-- generated column's computed value and writing it into an ordinary column
-- is unrestricted), but it means the restore leg below can't blindly
-- `select *` into `phases` the way every other table does - see that INSERT
-- for why.
--
-- Ordering: phases is a parent of tasks (tasks.phase_id references it), so
-- on delete it goes out AFTER tasks (children before parents, matching the
-- existing milestones/sprints ordering) and on insert it goes back in
-- BEFORE tasks (parents before children) - otherwise a reinserted task
-- pointing at a not-yet-restored phase would fail the FK check.

create table if not exists phases_demo_snapshot (like phases including defaults);

alter table phases_demo_snapshot enable row level security;

-- ── fix schema drift on the existing tasks_demo_snapshot table ──────────
-- tasks_demo_snapshot was created via `like tasks` by
-- demo_projects_nightly_reset.sql on 2026-07-16 - LIKE only captures the
-- source table's shape at CREATE TABLE time, it does not track later
-- ALTERs on tasks. phases_schema.sql added tasks.phase_id on 2026-07-17,
-- one day later, so tasks_demo_snapshot never picked it up (`create table
-- if not exists` is a no-op on a table that already exists). Without this,
-- capture_demo_snapshot()'s `insert into tasks_demo_snapshot select * from
-- tasks` fails with "INSERT has more expressions than target columns" the
-- moment it runs - which is exactly what happened the first time this file
-- was run. Appending the column here (rather than dropping and recreating
-- the table) keeps it in the same relative "last column" position both
-- tables ended up with, which matters because `select *` with no explicit
-- column list matches source to target by ORDINAL POSITION, not by name.
--
-- Checked every other _demo_snapshot table's source against every
-- migration dated after 2026-07-16 (when demo_projects_nightly_reset.sql
-- was written): milestones and sprints haven't gained any columns since,
-- and the only other post-07-16 schema change (hide_project_from_list.sql,
-- not yet run) touches project_collaborators, which the nightly reset
-- already deliberately never snapshots. tasks.phase_id is the only drift.
alter table tasks_demo_snapshot add column if not exists phase_id uuid;

-- ── schema-drift preflight ───────────────────────────────────────────────
-- Turns the next occurrence of this exact class of bug into a clear,
-- actionable error instead of a cryptic "INSERT has more expressions than
-- target columns" - checked against every tracked table before either
-- function does anything destructive. This catches a MISSING column on a
-- _demo_snapshot table (this bug); it does NOT catch a generated column on
-- the live side needing special handling on restore (a different, rarer
-- problem - see the `phases` restore INSERT below, which is hand-written
-- for exactly that reason). If a future migration adds a generated column
-- to another tracked table, its restore INSERT needs the same explicit
-- column-list treatment `phases` gets here.
create or replace function public.verify_demo_snapshot_schema()
returns void
language plpgsql
as $$
declare
  tracked_tables text[] := array[
    'projects', 'milestones', 'sprints', 'phases', 'tasks', 'sprint_retros',
    'charters', 'requirements_briefs', 'risk_logs', 'exec_comms_plans',
    'team_newsletters', 'budget_trackers', 'status_updates',
    'document_versions', 'post_mortems', 'project_evaluations'
  ];
  t text;
  live_cols text[];
  snap_cols text[];
  missing text[];
begin
  foreach t in array tracked_tables loop
    select array_agg(column_name order by column_name) into live_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t;

    select array_agg(column_name order by column_name) into snap_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t || '_demo_snapshot';

    if snap_cols is null then
      raise exception 'verify_demo_snapshot_schema: % has no matching %_demo_snapshot table', t, t;
    end if;

    select array_agg(c) into missing from unnest(live_cols) c where c <> all(snap_cols);

    if missing is not null then
      raise exception
        'verify_demo_snapshot_schema: %_demo_snapshot is missing column(s) % present on % - add them (matching type, appended at the end) before capture/restore can run',
        t, missing, t;
    end if;
  end loop;
end;
$$;

create or replace function public.capture_demo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'capture_demo_snapshot: no rows in projects where is_demo = true';
  end if;

  truncate
    projects_demo_snapshot, milestones_demo_snapshot, sprints_demo_snapshot,
    phases_demo_snapshot, tasks_demo_snapshot, sprint_retros_demo_snapshot,
    charters_demo_snapshot, requirements_briefs_demo_snapshot, risk_logs_demo_snapshot,
    exec_comms_plans_demo_snapshot, team_newsletters_demo_snapshot,
    budget_trackers_demo_snapshot, status_updates_demo_snapshot,
    document_versions_demo_snapshot, post_mortems_demo_snapshot,
    project_evaluations_demo_snapshot;

  insert into projects_demo_snapshot select * from projects where id = any(demo_ids);
  insert into milestones_demo_snapshot select * from milestones where project_id = any(demo_ids);
  insert into sprints_demo_snapshot select * from sprints where project_id = any(demo_ids);
  insert into phases_demo_snapshot select * from phases where project_id = any(demo_ids);
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

create or replace function public.restore_demo_projects()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'restore_demo_projects: no rows in projects where is_demo = true - refusing to run';
  end if;

  if (select count(*) from projects_demo_snapshot where id = any(demo_ids)) <> array_length(demo_ids, 1) then
    raise exception 'restore_demo_projects: is_demo project set does not match projects_demo_snapshot - run capture_demo_snapshot() first';
  end if;

  -- delete: children before parents
  delete from sprint_retros where sprint_id in (select id from sprints where project_id = any(demo_ids));
  delete from tasks where project_id = any(demo_ids);
  delete from milestones where project_id = any(demo_ids);
  delete from sprints where project_id = any(demo_ids);
  delete from phases where project_id = any(demo_ids);
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

  -- Can't `select *` here like every other table - phases.effective_start_date/
  -- effective_end_date are GENERATED ALWAYS ... STORED columns, and Postgres
  -- rejects an INSERT that supplies an explicit value for a generated column
  -- (which is what an implicit-column-list `select *` does the moment the
  -- source and target both have a same-named column there - phases_demo_snapshot's
  -- copy is an ordinary column, per the LIKE-without-INCLUDING-GENERATED note up
  -- top, but that doesn't matter on this side: the failure is about the TARGET,
  -- `phases`, having a generated column, not about the source). Naming every
  -- other column explicitly and omitting both generated ones is required - they
  -- recompute themselves from auto_start_date/auto_end_date/custom_start_date/
  -- custom_end_date/is_custom_mode, all of which ARE restored below, the instant
  -- the row lands.
  insert into phases (
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  )
  select
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  from phases_demo_snapshot;

  -- See tasks_demo_snapshot's comment in demo_projects_nightly_reset.sql -
  -- a single INSERT ... SELECT loading every task in one statement handles
  -- the self-referencing depends_on FK safely (NOT DEFERRABLE only pins the
  -- check to end-of-statement, not row-by-row) - same reasoning applies to
  -- the new phase_id FK, which points at a table (not self-referencing) but
  -- is restored just above this statement either way.
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

-- Bake in a fresh baseline that includes the phases just backfilled by
-- phases_schema.sql - otherwise the first nightly restore after this runs
-- would wipe demo projects' phases back to an empty phases_demo_snapshot
-- (captured before phases existed) and violate the NOT NULL-free but
-- app-expected "every non-Agile project has 4 phases" invariant.
select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select column_name from information_schema.columns
--   where table_name = 'tasks_demo_snapshot' and column_name = 'phase_id';
--   -- expect 1 row
--
--   select (select count(*) from phases_demo_snapshot) as phases;
--
--   select public.restore_demo_projects(); -- safe to test immediately
