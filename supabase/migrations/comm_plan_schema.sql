-- Communication Plan: same "one parent doc row per project + real child
-- rows" shape as Stakeholder Registry (stakeholder_registries -> stakeholders,
-- see stakeholder_registry_schema.sql), plus a risk_tasks-style junction
-- table (comm_plan_audience) linking each comm_plan_items row to the
-- Stakeholder Registry rows it targets.
--
-- Database layer only - no frontend, no nav, no documentTypes.jsx
-- registration in this migration (Communication Plan is NOT a
-- DOCUMENT_TYPES entry, same reasoning as Stakeholder Registry: own-route
-- manual CRUD, no AI Q&A intake, no generate-once lifecycle).
--
-- suggestions_run_at is baked into communication_plans from the start
-- (unlike stakeholder_registries, which got it in a later migration,
-- add_stakeholder_suggestions_tracking.sql) - same nullable/no-default
-- column, same auto-fire-once-gate meaning: NULL = never auto-fired.
--
-- comm_plan_audience deliberately has NO consistency trigger (unlike
-- risk_tasks' enforce_risk_task_project_consistency) - a pure add/remove
-- junction row has nothing to "update" in place (composite PK is the only
-- data), so there's no post-insert drift case to guard against. RLS has no
-- update policy either, matching that shape.

-- ── communication_plans ──────────────────────────────────────────────────

create table if not exists communication_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  suggestions_run_at timestamptz,
  created_at timestamptz not null default now()
);

alter table communication_plans enable row level security;

create policy "project members can view" on communication_plans
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on communication_plans
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on communication_plans
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on communication_plans
  for delete to authenticated using (can_edit_project(project_id));

-- ── comm_plan_items ──────────────────────────────────────────────────────

create table if not exists comm_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references communication_plans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in (
    'Status Update', 'Milestone/Deliverable Report', 'Risk/Issue Escalation',
    'Budget Review', 'Decision Request', 'Stakeholder Check-in',
    'Kickoff/Onboarding', 'Project Close-out'
  )),
  purpose text,
  owner text,
  format text not null check (format in ('Email', 'Meeting', 'Status Report')),
  frequency text not null check (frequency in ('Daily', 'Weekly', 'Biweekly', 'Monthly', 'Ad hoc')),
  source text not null default 'manual' check (source in ('manual', 'assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comm_plan_items_plan_id_idx on comm_plan_items (plan_id);
create index if not exists comm_plan_items_project_id_idx on comm_plan_items (project_id);

-- Mirrors set_stakeholder_project_id - callers only ever need to supply
-- plan_id on insert.
create or replace function public.set_comm_plan_item_project_id()
returns trigger
language plpgsql
as $$
begin
  select project_id into new.project_id from communication_plans where id = new.plan_id;
  return new;
end;
$$;

drop trigger if exists comm_plan_items_set_project_id on comm_plan_items;
create trigger comm_plan_items_set_project_id
  before insert on comm_plan_items
  for each row
  execute function public.set_comm_plan_item_project_id();

-- Guards the one case set_comm_plan_item_project_id can't cover: an update
-- that changes plan_id or project_id after the row already exists. Silently
-- drops the row's update (return null) rather than rejecting the whole
-- statement, same shape as enforce_stakeholder_project_consistency.
create or replace function public.enforce_comm_plan_item_project_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_project uuid;
begin
  select project_id into plan_project from communication_plans where id = new.plan_id;

  if new.project_id is distinct from plan_project then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_comm_plan_item_project_consistency on comm_plan_items;
create trigger enforce_comm_plan_item_project_consistency
  before update on comm_plan_items
  for each row
  execute function public.enforce_comm_plan_item_project_consistency();

create or replace function public.set_comm_plan_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists comm_plan_items_set_updated_at on comm_plan_items;
create trigger comm_plan_items_set_updated_at
  before update on comm_plan_items
  for each row
  execute function public.set_comm_plan_item_updated_at();

alter table comm_plan_items enable row level security;

create policy "project members can view" on comm_plan_items
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on comm_plan_items
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on comm_plan_items
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on comm_plan_items
  for delete to authenticated using (can_edit_project(project_id));

-- ── comm_plan_audience ───────────────────────────────────────────────────
-- Junction: comm_plan_items <-> stakeholders. Follows risk_tasks' template
-- exactly (composite PK, cascade both FKs, RLS via parent-subquery), minus
-- the consistency trigger (see header note).

create table if not exists comm_plan_audience (
  item_id uuid not null references comm_plan_items(id) on delete cascade,
  stakeholder_id uuid not null references stakeholders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, stakeholder_id)
);

alter table comm_plan_audience enable row level security;

create policy "project members can view" on comm_plan_audience
  for select to authenticated
  using (has_project_access((select ci.project_id from comm_plan_items ci where ci.id = comm_plan_audience.item_id)));
create policy "project editors can insert" on comm_plan_audience
  for insert to authenticated
  with check (can_edit_project((select ci.project_id from comm_plan_items ci where ci.id = comm_plan_audience.item_id)));
create policy "project editors can delete" on comm_plan_audience
  for delete to authenticated
  using (can_edit_project((select ci.project_id from comm_plan_items ci where ci.id = comm_plan_audience.item_id)));

-- ── demo reset wiring ────────────────────────────────────────────────────
-- Full function bodies replaced (matches stakeholder_registry_schema.sql's
-- own approach) rather than diffed, since capture_demo_snapshot/
-- restore_demo_projects/verify_demo_snapshot_schema are plain
-- create-or-replace with no ALTER FUNCTION equivalent. Baseline copied from
-- stakeholder_registry_schema.sql (latest prior version of these three
-- functions - add_stakeholder_suggestions_tracking.sql only added a column,
-- it didn't touch these bodies).
--
-- This closes CLAUDE.md's flagged gap (risks/risk_notes/risk_tasks were
-- never added to demo reset) for these three new tables specifically -
-- all three, parent AND both children, are wired in from this migration on.

create table if not exists communication_plans_demo_snapshot (like communication_plans including defaults);
create table if not exists comm_plan_items_demo_snapshot (like comm_plan_items including defaults);
create table if not exists comm_plan_audience_demo_snapshot (like comm_plan_audience including defaults);

alter table communication_plans_demo_snapshot enable row level security;
alter table comm_plan_items_demo_snapshot enable row level security;
alter table comm_plan_audience_demo_snapshot enable row level security;

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
    'communication_plans', 'comm_plan_items', 'comm_plan_audience'
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
    communication_plans_demo_snapshot, comm_plan_items_demo_snapshot, comm_plan_audience_demo_snapshot;

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
  insert into communication_plans_demo_snapshot select * from communication_plans where project_id = any(demo_ids);
  insert into comm_plan_items_demo_snapshot select * from comm_plan_items where project_id = any(demo_ids);

  insert into comm_plan_audience_demo_snapshot
    select ca.* from comm_plan_audience ca
    join comm_plan_items ci on ci.id = ca.item_id
    where ci.project_id = any(demo_ids);
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
  delete from comm_plan_audience where item_id in (select id from comm_plan_items where project_id = any(demo_ids));
  delete from comm_plan_items where project_id = any(demo_ids);
  delete from communication_plans where project_id = any(demo_ids);

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
  insert into communication_plans select * from communication_plans_demo_snapshot;
  insert into comm_plan_items select * from comm_plan_items_demo_snapshot;
  insert into comm_plan_audience select * from comm_plan_audience_demo_snapshot;

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

-- Bake in a fresh baseline that includes communication plans (empty on
-- every demo project until this runs, same as stakeholder registries before
-- their own migration).
select public.capture_demo_snapshot();

-- ── Verification - run after the block above ────────────────────────────
--
-- 1. Confirm all three tables exist with RLS enabled:
--   select relname, relrowsecurity from pg_class
--   where relname in ('communication_plans', 'comm_plan_items', 'comm_plan_audience');
--
-- 2. Confirm policy counts (expect communication_plans=4, comm_plan_items=4, comm_plan_audience=3):
--   select tablename, count(*) from pg_policies
--   where tablename in ('communication_plans', 'comm_plan_items', 'comm_plan_audience') group by tablename;
--
-- 3. Confirm triggers landed (expect 3 rows, all tgenabled = 'O'):
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--   where tgname in ('comm_plan_items_set_project_id',
--     'enforce_comm_plan_item_project_consistency', 'comm_plan_items_set_updated_at');
--
-- 4. Confirm demo snapshot wiring:
--   select (select count(*) from communication_plans_demo_snapshot) as plans,
--          (select count(*) from comm_plan_items_demo_snapshot) as items,
--          (select count(*) from comm_plan_audience_demo_snapshot) as audience;
--
--   select public.restore_demo_projects(); -- safe to test immediately
