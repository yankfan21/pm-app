-- Phase 1 of multi-predecessor dependency support: schema only, no
-- frontend changes in this migration. tasks.depends_on (added in
-- tasks_depends_on.sql) is a single scalar FK - "single dependency per
-- task for v1... simpler to build and covers the common case." This adds
-- a real join table so a task can eventually have more than one
-- predecessor, without touching depends_on or any frontend code yet (see
-- CLAUDE.md "Known follow-ups" for the cleanup note added alongside this
-- migration).
--
-- Scope check run before writing this file (scratch-depends-on-project-
-- scope-check.sql): 139 same-project rows, 0 cross-project rows. So this
-- migration carries all 139 existing depends_on values forward - nothing
-- gets dropped this time - but the cross-project filter/trigger stays in
-- place regardless, since tasks.depends_on itself has no such guard (an
-- incidental gap found during the dependency-model audit, not something
-- this migration fixes on the legacy column) and nothing stops a future
-- row from being invalid.

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Matches the current live phase4 model (see phase4_full_lockdown_no_anon.sql):
-- authenticated-only, has_project_access for read, can_edit_project for
-- write, no anon policy at all. task_dependencies has no project_id column
-- of its own - same bespoke shape as sprint_retros, resolved via a subquery
-- to the owning task. Resolving through task_id alone is sufficient: the
-- trigger below guarantees task_id and depends_on_id always share a
-- project for any row that actually lands in this table.

alter table task_dependencies enable row level security;

drop policy if exists "project members can view" on task_dependencies;
create policy "project members can view" on task_dependencies
  for select to authenticated
  using (has_project_access((select t.project_id from tasks t where t.id = task_dependencies.task_id)));

drop policy if exists "project editors can insert" on task_dependencies;
create policy "project editors can insert" on task_dependencies
  for insert to authenticated
  with check (can_edit_project((select t.project_id from tasks t where t.id = task_dependencies.task_id)));

drop policy if exists "project editors can update" on task_dependencies;
create policy "project editors can update" on task_dependencies
  for update to authenticated
  using (can_edit_project((select t.project_id from tasks t where t.id = task_dependencies.task_id)))
  with check (can_edit_project((select t.project_id from tasks t where t.id = task_dependencies.task_id)));

drop policy if exists "project editors can delete" on task_dependencies;
create policy "project editors can delete" on task_dependencies
  for delete to authenticated
  using (can_edit_project((select t.project_id from tasks t where t.id = task_dependencies.task_id)));

-- ── Cross-project guard on task_dependencies itself ─────────────────────
-- Same "correct instead of reject" behavior
-- fix_enforce_task_project_consistency_null_not_reject.sql settled on for
-- tasks.milestone_id/sprint_id - but there's no separate nullable column
-- to null here (task_id/depends_on_id ARE the row's whole identity), so
-- the equivalent correction is silently skipping the insert/update of
-- that one row instead of nulling a field. Returning null from a BEFORE
-- ROW trigger cancels just that row, not the whole statement, so a
-- multi-row insert with one bad pair still lands every valid row.

create or replace function public.enforce_task_dependency_project_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_project uuid;
  dep_project uuid;
begin
  select project_id into task_project from tasks where id = new.task_id;
  select project_id into dep_project from tasks where id = new.depends_on_id;

  if task_project is distinct from dep_project then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_dependency_project_consistency on task_dependencies;
create trigger enforce_task_dependency_project_consistency
  before insert or update on task_dependencies
  for each row
  execute function public.enforce_task_dependency_project_consistency();

-- ── Cleanup when a task moves to a different project ───────────────────
-- Mirrors the scenario enforce_task_project_consistency.sql guards for
-- milestone_id/sprint_id: a task's project_id changes (reassigned to a
-- different project) without its dependency links being updated first.
-- Fires only "of project_id" so an edit to an unrelated column like title
-- can't trigger a scan. Deletes rather than nulls, same reasoning as
-- above - the row itself is the reference.

create or replace function public.cleanup_stale_task_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from task_dependencies td
  where (td.task_id = new.id or td.depends_on_id = new.id)
    and exists (
      select 1
      from tasks t1
      join tasks t2 on t2.id = td.depends_on_id
      where t1.id = td.task_id
        and t1.project_id is distinct from t2.project_id
    );
  return null; -- AFTER trigger - return value is ignored either way
end;
$$;

drop trigger if exists cleanup_stale_task_dependencies on tasks;
create trigger cleanup_stale_task_dependencies
  after update of project_id on tasks
  for each row
  execute function public.cleanup_stale_task_dependencies();

-- ── Data migration: backfill from tasks.depends_on ──────────────────────
-- One row per task with a non-null depends_on, same-project pairs only
-- (0 of the 139 existing rows were cross-project per the scope check, but
-- the join condition is kept so this stays correct/idempotent if re-run
-- later against different data). tasks.depends_on is left in place,
-- untouched - see CLAUDE.md follow-up note.

insert into task_dependencies (task_id, depends_on_id)
select t.id, t.depends_on
from tasks t
join tasks dep on dep.id = t.depends_on
where t.depends_on is not null
  and dep.project_id = t.project_id
on conflict (task_id, depends_on_id) do nothing;

-- ── Verification - run after the block above ────────────────────────────
--
-- 1. Row count - expect 139 (all same-project rows from the scope check):
--   select count(*) from task_dependencies;
--
-- 2. Confirm both triggers are attached and enabled:
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--   where tgname in ('enforce_task_dependency_project_consistency', 'cleanup_stale_task_dependencies');
--   -- expect 2 rows, both tgenabled = 'O'
--
-- 3. Confirm every row is same-project (should return 0 rows always,
--    since both the insert filter and the BEFORE trigger guard this):
--   select * from task_dependencies td
--   join tasks t1 on t1.id = td.task_id
--   join tasks t2 on t2.id = td.depends_on_id
--   where t1.project_id is distinct from t2.project_id;
--
-- 4. Confirm RLS policies landed (expect 4 rows: select/insert/update/delete):
--   select policyname, cmd, roles from pg_policies where tablename = 'task_dependencies';
