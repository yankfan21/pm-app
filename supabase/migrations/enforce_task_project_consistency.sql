-- Guardrail against the exact class of bug found and fixed in WMS Tower
-- App / TEST UPLOAD on 2026-07-13: a task's project_id got moved
-- (fix_wms_backlog_project_id.sql) without also re-pointing its
-- sprint_id, leaving 10 rows referencing a sprint that belonged to a
-- different project - invisible until the Sprint Board silently failed
-- to show them as assigned. This trigger makes that specific mistake
-- impossible at the database level, regardless of whether the write
-- comes from the app UI or a manual SQL migration.
--
-- Fires only when project_id, milestone_id, or sprint_id actually change
-- (via "update of ...") rather than on every update - an edit to an
-- unrelated column like title can't introduce a new mismatch, and this
-- avoids retroactively blocking unrelated edits on any already-mismatched
-- legacy row elsewhere in the database that hasn't been cleaned up yet.
-- If you'd rather it re-validate on every single update regardless of
-- which columns changed, drop the "of project_id, milestone_id,
-- sprint_id" clause below.
--
-- Deliberately does not touch milestones/sprints RLS or add any check
-- there - deleting a milestone or sprint already safely nulls out
-- referencing tasks via the existing "on delete set null" FK, so that
-- path was never the problem.

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

  return new;
end;
$$;

drop trigger if exists enforce_task_project_consistency on tasks;
create trigger enforce_task_project_consistency
  before insert or update of project_id, milestone_id, sprint_id on tasks
  for each row
  execute function public.enforce_task_project_consistency();

-- Verify afterward - both should succeed (no cross-project mismatch
-- exists post-cleanup) and confirm the trigger is attached:
--
--   select count(*) from tasks t
--   where t.milestone_id is not null
--     and not exists (select 1 from milestones m where m.id = t.milestone_id and m.project_id = t.project_id);
--
--   select count(*) from tasks t
--   where t.sprint_id is not null
--     and not exists (select 1 from sprints s where s.id = t.sprint_id and s.project_id = t.project_id);
--
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--   where tgname = 'enforce_task_project_consistency';
