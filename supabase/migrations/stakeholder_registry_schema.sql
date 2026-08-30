-- Stakeholder Registry: one parent row per project (stakeholder_registries),
-- real child rows for individual stakeholders (stakeholders) - same "one
-- parent doc row + real child rows, denormalized project_id kept in sync via
-- trigger" shape as risk_logs -> risks (see risk_log_structured_schema.sql).
--
-- Database layer only - no frontend, no nav, no documentTypes.jsx
-- registration in this migration.
--
-- ── trigger design note (deviates from a literal risk_tasks copy) ────────
-- risks has ONE trigger (set_risk_project_id, BEFORE INSERT only) because
-- risk_log_id is never reassigned after creation, so project_id can never
-- drift out of sync post-insert. risk_tasks has a DIFFERENT trigger
-- (enforce_risk_task_project_consistency, BEFORE INSERT OR UPDATE) because
-- it has TWO independent parents (risk_id, task_id) with no auto-populate
-- at all - either one can point cross-project, so every write needs a guard.
--
-- stakeholders was asked to have both: an auto-populate trigger (risks-
-- style) AND a consistency guard (risk_tasks-style, "BEFORE INSERT/UPDATE").
-- Running both on INSERT is redundant and order-fragile (Postgres fires
-- same-event triggers in alphabetical order by trigger name, and there's no
-- reason a mismatch could survive the auto-populate trigger on INSERT
-- anyway, since it unconditionally overwrites new.project_id from the
-- parent). So: set_stakeholder_project_id is BEFORE INSERT only (mirrors
-- risks exactly), and enforce_stakeholder_project_consistency is BEFORE
-- UPDATE only - it guards the one case that can actually happen: a future
-- update to registry_id or project_id after the row already exists. Net
-- effect is identical coverage to a literal "BEFORE INSERT OR UPDATE" guard,
-- without the ordering hazard.
--
-- ── demo reset note ────────────────────────────────────────────────────────
-- risks/risk_notes/risk_tasks were never actually added to
-- capture_demo_snapshot()/restore_demo_projects() (checked: no
-- risks_demo_snapshot table exists, risk_log_structured_schema.sql doesn't
-- touch either function) - risk_logs (parent) is wired in, its risks
-- (child) is not. So there's no real risks precedent for a parent+child
-- pair entering demo reset together; the additions below instead follow the
-- general project_id-scoped-table pattern every other entry in these
-- functions already uses (most recently add_scopings_to_demo_reset.sql),
-- extended to a two-table parent/child pair the same way phases (single
-- table) and sprint_retros (indirect child) were each folded in previously.
-- Flagging this gap since the ask assumed risks was already wired in.

-- ── stakeholder_registries ─────────────────────────────────────────────────

create table if not exists stakeholder_registries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table stakeholder_registries enable row level security;

create policy "project members can view" on stakeholder_registries
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on stakeholder_registries
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on stakeholder_registries
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on stakeholder_registries
  for delete to authenticated using (can_edit_project(project_id));

-- ── stakeholders ─────────────────────────────────────────────────────────

create table if not exists stakeholders (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references stakeholder_registries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  role_title text,
  org text,
  contact_info text,
  quadrant text not null check (quadrant in ('manage_closely', 'keep_satisfied', 'keep_informed', 'monitor')),
  source text not null default 'manual' check (source in ('manual', 'assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stakeholders_registry_id_idx on stakeholders (registry_id);
create index if not exists stakeholders_project_id_idx on stakeholders (project_id);

-- Mirrors risks' set_risk_project_id - callers only ever need to supply
-- registry_id on insert.
create or replace function public.set_stakeholder_project_id()
returns trigger
language plpgsql
as $$
begin
  select project_id into new.project_id from stakeholder_registries where id = new.registry_id;
  return new;
end;
$$;

drop trigger if exists stakeholders_set_project_id on stakeholders;
create trigger stakeholders_set_project_id
  before insert on stakeholders
  for each row
  execute function public.set_stakeholder_project_id();

-- Guards the one case set_stakeholder_project_id can't cover: an update
-- that changes registry_id or project_id after the row already exists.
-- Silently drops the row's update (return null) rather than rejecting the
-- whole statement, same shape as enforce_risk_task_project_consistency.
create or replace function public.enforce_stakeholder_project_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registry_project uuid;
begin
  select project_id into registry_project from stakeholder_registries where id = new.registry_id;

  if new.project_id is distinct from registry_project then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_stakeholder_project_consistency on stakeholders;
create trigger enforce_stakeholder_project_consistency
  before update on stakeholders
  for each row
  execute function public.enforce_stakeholder_project_consistency();

create or replace function public.set_stakeholder_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stakeholders_set_updated_at on stakeholders;
create trigger stakeholders_set_updated_at
  before update on stakeholders
  for each row
  execute function public.set_stakeholder_updated_at();

alter table stakeholders enable row level security;

create policy "project members can view" on stakeholders
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on stakeholders
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on stakeholders
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on stakeholders
  for delete to authenticated using (can_edit_project(project_id));

-- ── demo reset wiring ──────────────────────────────────────────────────────
-- Full function bodies replaced (matches add_scopings_to_demo_reset.sql's
-- own approach) rather than diffed, since capture_demo_snapshot/
-- restore_demo_projects/verify_demo_snapshot_schema are plain
-- create-or-replace with no ALTER FUNCTION equivalent. Baseline copied from
-- add_scopings_to_demo_reset.sql (2026-08-29 09:32), the latest prior
-- version of these three functions - confirmed nothing between that file and
-- this one touches them.

create table if not exists stakeholder_registries_demo_snapshot (like stakeholder_registries including defaults);
create table if not exists stakeholders_demo_snapshot (like stakeholders including defaults);

alter table stakeholder_registries_demo_snapshot enable row level security;
alter table stakeholders_demo_snapshot enable row level security;

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
    'stakeholder_registries', 'stakeholders'
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
    stakeholder_registries_demo_snapshot, stakeholders_demo_snapshot;

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

-- Bake in a fresh baseline that includes stakeholder registries (empty on
-- every demo project until this runs, same as scopings/issue_logs before
-- their own migrations).
select public.capture_demo_snapshot();

-- ── Verification - run after the block above ────────────────────────────
--
-- 1. Confirm both tables exist with RLS enabled:
--   select relname, relrowsecurity from pg_class
--   where relname in ('stakeholder_registries', 'stakeholders');
--
-- 2. Confirm policy counts (expect stakeholder_registries=4, stakeholders=4):
--   select tablename, count(*) from pg_policies
--   where tablename in ('stakeholder_registries', 'stakeholders') group by tablename;
--
-- 3. Confirm triggers landed (expect 3 rows, all tgenabled = 'O'):
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--   where tgname in ('stakeholders_set_project_id',
--     'enforce_stakeholder_project_consistency', 'stakeholders_set_updated_at');
--
-- 4. Confirm demo snapshot wiring:
--   select (select count(*) from stakeholder_registries_demo_snapshot) as registries,
--          (select count(*) from stakeholders_demo_snapshot) as stakeholders;
--
--   select public.restore_demo_projects(); -- safe to test immediately
