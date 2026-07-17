-- Follow-up to enforce_task_project_consistency.sql (2026-07-13, WMS Tower
-- incident). That trigger correctly catches a task's sprint_id/milestone_id
-- pointing at a different project than tasks.project_id - but it does so by
-- raising an exception and rejecting the whole write. In practice that
-- blocks the legitimate case: a PM reassigning a task to a new project in
-- one step, where the old sprint_id/milestone_id is now stale by
-- definition and hasn't been cleared yet.
--
-- This replaces the function body so the same check instead silently nulls
-- the stale reference and lets the write through. `create or replace
-- function` + `drop/create trigger` are idempotent, so this is safe to run
-- whether or not the original raise-based version was ever actually
-- installed in this database.
--
-- Also widened from "before insert or update of project_id, milestone_id,
-- sprint_id" to plain "before insert or update" - now that a mismatch just
-- gets quietly corrected instead of blocking anything, there's no downside
-- to re-checking on every write, including ones that touch unrelated
-- columns like title.

create or replace function public.enforce_task_project_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.sprint_id is not null then
    if not exists (
      select 1 from sprints
      where id = new.sprint_id and project_id = new.project_id
    ) then
      new.sprint_id := null;
    end if;
  end if;

  if new.milestone_id is not null then
    if not exists (
      select 1 from milestones
      where id = new.milestone_id and project_id = new.project_id
    ) then
      new.milestone_id := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_project_consistency on tasks;
create trigger enforce_task_project_consistency
  before insert or update on tasks
  for each row
  execute function public.enforce_task_project_consistency();

-- ============================================================
-- Verification - run after the block above
-- ============================================================

-- 1. Confirm the trigger is attached and enabled:
select tgname, tgrelid::regclass, tgenabled
from pg_trigger
where tgname = 'enforce_task_project_consistency';
-- expect exactly one row, tgenabled = 'O'

-- 2. Live behavioral test, wrapped so it leaves no trace: creates a real
--    task row under one existing project pointing at another existing
--    project's real sprint, confirms it gets nulled on both insert and
--    update, then rolls back so nothing persists.
begin;

do $$
declare
  proj_a uuid;
  proj_b uuid;
  sprint_b uuid;
  test_task uuid;
  after_insert uuid;
  after_update uuid;
begin
  select id into proj_a from projects order by created_at limit 1;
  select id into proj_b from projects where id <> proj_a order by created_at limit 1;
  select id into sprint_b from sprints where project_id = proj_b limit 1;

  if proj_a is null or proj_b is null or sprint_b is null then
    raise notice 'SKIPPED: need at least 2 projects and 1 sprint on the second project to run this test.';
    return;
  end if;

  -- INSERT case: task under proj_a, sprint_id pointing at proj_b's sprint
  insert into tasks (project_id, title, sprint_id)
  values (proj_a, '__trigger_test_row__', sprint_b)
  returning id, sprint_id into test_task, after_insert;

  if after_insert is null then
    raise notice 'PASS: sprint_id nulled on INSERT (cross-project mismatch caught).';
  else
    raise exception 'FAIL: sprint_id (%) was NOT nulled on INSERT.', after_insert;
  end if;

  -- UPDATE case: directly re-assign the same mismatched sprint_id
  update tasks set sprint_id = sprint_b where id = test_task;
  select sprint_id into after_update from tasks where id = test_task;

  if after_update is null then
    raise notice 'PASS: sprint_id nulled on UPDATE (cross-project mismatch caught).';
  else
    raise exception 'FAIL: sprint_id (%) was NOT nulled on UPDATE.', after_update;
  end if;
end $$;

rollback; -- discard the test insert/update - nothing persisted either way

-- 3. Informational only: rows that were already stale BEFORE this trigger
--    existed won't be retroactively fixed (it only fires on writes to a
--    given row). Flags anything left over for manual cleanup:
select id, project_id, sprint_id, milestone_id
from tasks
where (sprint_id is not null and not exists (
        select 1 from sprints s where s.id = tasks.sprint_id and s.project_id = tasks.project_id))
   or (milestone_id is not null and not exists (
        select 1 from milestones m where m.id = tasks.milestone_id and m.project_id = tasks.project_id));
