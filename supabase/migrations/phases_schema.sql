-- Phases: fixed Initiation -> Planning -> Execution -> Closing grouping
-- layer for Waterfall/Hybrid projects. Agile projects never get phases -
-- the New Project wizard only seeds them when methodology is waterfall or
-- hybrid, the same gate BacklogView/SprintBoardView already use for the
-- agile side.
--
-- Independent of milestones (milestones_schema.sql) and sprints
-- (product_backlog_schema.sql) - a task can carry a phase_id, a
-- milestone_id, and a sprint_id all at once, each answering a different
-- question (which stage of the plan / which delivery checkpoint / which
-- sprint). For Hybrid projects, sprints run inside the Execution phase by
-- convention, but that's a planning convention surfaced in the UI, not
-- something enforced by a phase_id on backlog/sprint tasks here - phase
-- assignment in the frontend is only offered on the same Waterfall-side
-- task form/list that already offers milestone assignment (gated on
-- backlog_status is null, same as GanttChart's task filter).
--
-- No customization yet (rename/reorder/add/remove phases - a stated future
-- enhancement, not built here). phase_number is pinned to 1-4 by the check
-- constraint below; phase_name stays a plain column seeded by the frontend
-- from a fixed 4-name list rather than being derived from phase_number, so
-- a future rename feature won't need another migration to make it
-- editable.
--
-- auto_start_date/auto_end_date are maintained by the trigger below from
-- min(task start)/max(task due) across that phase's tasks, using the same
-- "start_date || due_date" / "due_date || start_date" single-date fallback
-- GanttChart.jsx/ganttLayout.js already use for a task with only one date
-- set. custom_start_date/custom_end_date are exclusively PM-written, from
-- the Phase Detail view's Custom-mode date pickers - the trigger never
-- touches them. effective_start_date/effective_end_date are generated
-- columns (computed from is_custom_mode + the two date pairs, all on the
-- same row) so every reader - Gantt, Phase Detail, anything future - gets
-- the "custom overrides auto" rule for free instead of re-implementing it
-- in JS on every call site.

create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  phase_number integer not null check (phase_number between 1 and 4),
  phase_name text not null,
  auto_start_date date,
  auto_end_date date,
  custom_start_date date,
  custom_end_date date,
  is_custom_mode boolean not null default false,
  effective_start_date date generated always as (
    case when is_custom_mode then custom_start_date else auto_start_date end
  ) stored,
  effective_end_date date generated always as (
    case when is_custom_mode then custom_end_date else auto_end_date end
  ) stored,
  created_at timestamptz not null default now()
);

create unique index if not exists phases_project_id_phase_number_key
  on phases (project_id, phase_number);

alter table phases enable row level security;

drop policy if exists "anon full access" on phases;
create policy "anon full access" on phases
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "authenticated full access (temporary)" on phases;
create policy "authenticated full access (temporary)" on phases
  for all
  to authenticated
  using (true)
  with check (true);

alter table tasks add column if not exists phase_id uuid references phases(id) on delete set null;

-- ── auto-calc trigger ────────────────────────────────────────────────────
-- Recomputes a phase's auto_start_date/auto_end_date from its tasks
-- whenever a task's phase_id, start_date, or due_date changes, or a task
-- is inserted/deleted. On a phase_id change, both the old and new phase
-- get recalculated - the row is leaving one phase's aggregate and joining
-- another's. Only ever writes auto_start_date/auto_end_date - custom_*
-- stays untouched, matching effective_*'s "custom overrides auto" rule.

create or replace function public.recalc_phase_auto_dates(p_phase_id uuid)
returns void
language plpgsql
as $$
begin
  if p_phase_id is null then
    return;
  end if;

  update phases
  set auto_start_date = sub.min_start,
      auto_end_date = sub.max_end
  from (
    select
      min(coalesce(start_date, due_date)) as min_start,
      max(coalesce(due_date, start_date)) as max_end
    from tasks
    where phase_id = p_phase_id
  ) sub
  where phases.id = p_phase_id;
end;
$$;

create or replace function public.trg_recalc_phase_auto_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_phase_auto_dates(old.phase_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    perform public.recalc_phase_auto_dates(old.phase_id);
  end if;

  perform public.recalc_phase_auto_dates(new.phase_id);
  return new;
end;
$$;

drop trigger if exists recalc_phase_auto_dates on tasks;
create trigger recalc_phase_auto_dates
  after insert or delete or update of phase_id, start_date, due_date on tasks
  for each row
  execute function public.trg_recalc_phase_auto_dates();

-- ── cross-project consistency ────────────────────────────────────────────
-- Extends the guardrail from enforce_task_project_consistency.sql (already
-- covering milestone_id/sprint_id, added after a real incident where a
-- task's project_id moved without its sprint_id following) to phase_id, so
-- the same class of bug can't happen here either.

create or replace function public.enforce_task_project_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.milestone_id is not null then
    if not exists (
      select 1 from milestones
      where id = new.milestone_id and project_id = new.project_id
    ) then
      raise exception
        'tasks.milestone_id (%) belongs to a different project than tasks.project_id (%)',
        new.milestone_id, new.project_id
        using errcode = '23514';
    end if;
  end if;

  if new.sprint_id is not null then
    if not exists (
      select 1 from sprints
      where id = new.sprint_id and project_id = new.project_id
    ) then
      raise exception
        'tasks.sprint_id (%) belongs to a different project than tasks.project_id (%)',
        new.sprint_id, new.project_id
        using errcode = '23514';
    end if;
  end if;

  if new.phase_id is not null then
    if not exists (
      select 1 from phases
      where id = new.phase_id and project_id = new.project_id
    ) then
      raise exception
        'tasks.phase_id (%) belongs to a different project than tasks.project_id (%)',
        new.phase_id, new.project_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_project_consistency on tasks;
create trigger enforce_task_project_consistency
  before insert or update of project_id, milestone_id, sprint_id, phase_id on tasks
  for each row
  execute function public.enforce_task_project_consistency();

-- ── backfill existing projects ───────────────────────────────────────────
-- The wizard (frontend change, separate from this migration) only seeds
-- phases for *new* Waterfall/Hybrid projects going forward. Without this
-- backfill, every project created before today - including the 3 shared
-- demo projects - would have no phases row at all, and the Gantt chart's
-- phase grouping would show nothing to group by. Seeds the same fixed 4
-- phases for every existing non-Agile project that doesn't already have
-- any, so it's safe to re-run this file.

insert into phases (project_id, phase_number, phase_name)
select p.id, n.phase_number, n.phase_name
from projects p
cross join (values
  (1, 'Initiation'),
  (2, 'Planning'),
  (3, 'Execution'),
  (4, 'Closing')
) as n(phase_number, phase_name)
where p.methodology <> 'agile'
  and not exists (select 1 from phases ph where ph.project_id = p.id);

-- One more pass to pick up dates for any pre-existing task that already
-- had a phase_id before this migration ran (impossible today since the
-- column didn't exist yet, but harmless and keeps this file safe to re-run
-- after a partial failure).
update phases ph
set auto_start_date = sub.min_start,
    auto_end_date = sub.max_end
from (
  select
    phase_id,
    min(coalesce(start_date, due_date)) as min_start,
    max(coalesce(due_date, start_date)) as max_end
  from tasks
  where phase_id is not null
  group by phase_id
) sub
where ph.id = sub.phase_id;

-- Verify afterward:
--
--   select relname, relrowsecurity from pg_class where relname = 'phases';
--   select policyname, roles, cmd from pg_policies where tablename = 'phases';
--   select p.methodology, count(distinct ph.project_id) as projects_with_phases
--   from projects p join phases ph on ph.project_id = p.id
--   group by p.methodology;
--   select project_id, count(*) from phases group by project_id having count(*) <> 4;
