-- Extends the Phase D nightly demo reset (demo_projects_nightly_reset.sql,
-- as further extended by add_phases_to_demo_reset.sql,
-- add_issue_logs_to_demo_reset.sql, add_scopings_to_demo_reset.sql, and
-- stakeholder_registry_schema.sql) to cover the Risk Log child tables added
-- in risk_log_structured_schema.sql: risks, risk_notes, risk_tasks.
--
-- This is a real gap, not a hypothetical one - risk_logs (the parent row)
-- has been in tracked_tables since demo_projects_nightly_reset.sql, but its
-- child tables never were. stakeholder_registry_schema.sql's own comments
-- (lines 30-41) already flagged this: no risks_demo_snapshot table exists,
-- and risk_log_structured_schema.sql never touched
-- capture_demo_snapshot()/restore_demo_projects(). Confirmed against the
-- live DB: no risks_demo_snapshot / risk_notes_demo_snapshot /
-- risk_tasks_demo_snapshot tables exist.
--
-- Three-level chain, two different scoping shapes:
--   risks: risk_log_id -> risk_logs (cascade), project_id -> projects
--     (denormalized via set_risk_project_id trigger) - same shape as
--     stakeholders (child with its own project_id), so scoped directly by
--     `project_id = any(demo_ids)` like every flat table already is.
--   risk_notes: risk_id -> risks (cascade), project_id -> projects
--     (denormalized via set_risk_note_project_id trigger) - same shape,
--     same direct scoping.
--   risk_tasks: risk_id -> risks (cascade), task_id -> tasks (cascade),
--     composite PK (risk_id, task_id), NO project_id column of its own -
--     same shape as sprint_retros (no project_id, join up one level), so
--     scoped via `risk_id in (select id from risks where project_id =
--     any(demo_ids))`.
--
-- Ordering: risk_logs -> risks -> risk_notes/risk_tasks is a real
-- dependency chain (unlike the flat tables, which have no relationships to
-- each other). Delete children before parents (risk_tasks, risk_notes,
-- risks, THEN risk_logs); reinsert parents before children (risk_logs,
-- THEN risks, risk_notes, risk_tasks).

create table if not exists risks_demo_snapshot (like risks including defaults);
create table if not exists risk_notes_demo_snapshot (like risk_notes including defaults);
create table if not exists risk_tasks_demo_snapshot (like risk_tasks including defaults);

alter table risks_demo_snapshot enable row level security;
alter table risk_notes_demo_snapshot enable row level security;
alter table risk_tasks_demo_snapshot enable row level security;

create or replace function public.verify_demo_snapshot_schema()
returns void
language plpgsql
as $$
declare
  tracked_tables text[] := array[
    'projects', 'milestones', 'sprints', 'phases', 'tasks', 'sprint_retros',
    'charters', 'requirements_briefs', 'risk_logs', 'issue_logs', 'scopings',
    'exec_comms_plans', 'team_newsletters', 'budget_trackers', 'status_updates',
    'document_versions', 'post_mortems', 'project_evaluations',
    'stakeholder_registries', 'stakeholders',
    'risks', 'risk_notes', 'risk_tasks'
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
    issue_logs_demo_snapshot, scopings_demo_snapshot,
    exec_comms_plans_demo_snapshot, team_newsletters_demo_snapshot,
    budget_trackers_demo_snapshot, status_updates_demo_snapshot,
    document_versions_demo_snapshot, post_mortems_demo_snapshot,
    project_evaluations_demo_snapshot,
    stakeholder_registries_demo_snapshot, stakeholders_demo_snapshot,
    risks_demo_snapshot, risk_notes_demo_snapshot, risk_tasks_demo_snapshot;

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
  insert into issue_logs_demo_snapshot select * from issue_logs where project_id = any(demo_ids);
  insert into scopings_demo_snapshot select * from scopings where project_id = any(demo_ids);
  insert into exec_comms_plans_demo_snapshot select * from exec_comms_plans where project_id = any(demo_ids);
  insert into team_newsletters_demo_snapshot select * from team_newsletters where project_id = any(demo_ids);
  insert into budget_trackers_demo_snapshot select * from budget_trackers where project_id = any(demo_ids);
  insert into status_updates_demo_snapshot select * from status_updates where project_id = any(demo_ids);
  insert into document_versions_demo_snapshot select * from document_versions where project_id = any(demo_ids);
  insert into post_mortems_demo_snapshot select * from post_mortems where project_id = any(demo_ids);
  insert into project_evaluations_demo_snapshot select * from project_evaluations where project_id = any(demo_ids);
  insert into stakeholder_registries_demo_snapshot select * from stakeholder_registries where project_id = any(demo_ids);
  insert into stakeholders_demo_snapshot select * from stakeholders where project_id = any(demo_ids);

  insert into risks_demo_snapshot select * from risks where project_id = any(demo_ids);
  insert into risk_notes_demo_snapshot select * from risk_notes where project_id = any(demo_ids);
  insert into risk_tasks_demo_snapshot
    select rt.* from risk_tasks rt
    where rt.risk_id in (select id from risks where project_id = any(demo_ids));
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
  delete from risk_tasks where risk_id in (select id from risks where project_id = any(demo_ids));
  delete from risk_notes where project_id = any(demo_ids);
  delete from risks where project_id = any(demo_ids);
  delete from risk_logs where project_id = any(demo_ids);
  delete from issue_logs where project_id = any(demo_ids);
  delete from scopings where project_id = any(demo_ids);
  delete from exec_comms_plans where project_id = any(demo_ids);
  delete from team_newsletters where project_id = any(demo_ids);
  delete from budget_trackers where project_id = any(demo_ids);
  delete from status_updates where project_id = any(demo_ids);
  delete from document_versions where project_id = any(demo_ids);
  delete from post_mortems where project_id = any(demo_ids);
  delete from project_evaluations where project_id = any(demo_ids);
  delete from stakeholders where project_id = any(demo_ids);
  delete from stakeholder_registries where project_id = any(demo_ids);

  -- reinsert: parents before children
  insert into milestones select * from milestones_demo_snapshot;
  insert into sprints select * from sprints_demo_snapshot;

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

  insert into tasks select * from tasks_demo_snapshot;

  insert into sprint_retros select * from sprint_retros_demo_snapshot;
  insert into charters select * from charters_demo_snapshot;
  insert into requirements_briefs select * from requirements_briefs_demo_snapshot;
  insert into risk_logs select * from risk_logs_demo_snapshot;

  insert into risks select * from risks_demo_snapshot;
  insert into risk_notes select * from risk_notes_demo_snapshot;
  insert into risk_tasks select * from risk_tasks_demo_snapshot;

  insert into issue_logs select * from issue_logs_demo_snapshot;
  insert into scopings select * from scopings_demo_snapshot;
  insert into exec_comms_plans select * from exec_comms_plans_demo_snapshot;
  insert into team_newsletters select * from team_newsletters_demo_snapshot;
  insert into budget_trackers select * from budget_trackers_demo_snapshot;
  insert into status_updates select * from status_updates_demo_snapshot;
  insert into document_versions select * from document_versions_demo_snapshot;
  insert into post_mortems select * from post_mortems_demo_snapshot;
  insert into project_evaluations select * from project_evaluations_demo_snapshot;
  insert into stakeholder_registries select * from stakeholder_registries_demo_snapshot;
  insert into stakeholders select * from stakeholders_demo_snapshot;

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

-- Bake in a fresh baseline that includes risks/risk_notes/risk_tasks
-- (matches live state until a PM adds/edits risks going forward).
select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select (select count(*) from risks_demo_snapshot) as risks,
--          (select count(*) from risk_notes_demo_snapshot) as risk_notes,
--          (select count(*) from risk_tasks_demo_snapshot) as risk_tasks;
--
--   select public.restore_demo_projects(); -- safe to test immediately
