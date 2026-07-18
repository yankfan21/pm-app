-- Phase 3 of multi-predecessor task dependencies: cycle detection.
--
-- task_dependencies_schema.sql (Phase 1) added enforce_task_dependency_
-- project_consistency, but that trigger only checks that task_id and
-- depends_on_id share a project - it has no idea what a cycle is. Nothing
-- in the schema stops A -> B -> A, or a longer chain A -> B -> C -> A, from
-- inserting cleanly today. This adds a second, separate trigger that walks
-- the existing dependency graph and rejects any insert/update that would
-- close a cycle.
--
-- Unlike the project-consistency trigger (which silently skips the bad row
-- by returning null - appropriate there because a bulk insert with one
-- cross-project row shouldn't abort the other valid rows), a cycle is a
-- request that makes no sense at all, so this one raises an exception and
-- aborts the write instead. Trigger firing order for multiple BEFORE ROW
-- triggers on the same table is alphabetical by trigger name in Postgres -
-- "enforce_task_dependency_project_consistency" sorts before
-- "prevent_task_dependency_cycles", so the cheap project check still runs
-- first and a cross-project row never reaches the graph walk at all.
--
-- Direction: task_dependencies.task_id depends_on task_dependencies.
-- depends_on_id (task_id can't start until depends_on_id is done). For a
-- new row (task_id=T, depends_on_id=D) to be safe, D must not already
-- (transitively) depend on T - if it does, T would end up depending on D
-- depending on ... depending on T. So the walk starts at D and follows the
-- same task_id -> depends_on_id edges forward; if T ever shows up in that
-- walk, inserting this row would close a cycle.

create or replace function public.prevent_task_dependency_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_found boolean;
begin
  with recursive chain(node_id, path) as (
    select new.depends_on_id, array[new.depends_on_id]
    union all
    select td.depends_on_id, chain.path || td.depends_on_id
    from task_dependencies td
    join chain on td.task_id = chain.node_id
    where not td.depends_on_id = any(chain.path)
  )
  select exists (select 1 from chain where node_id = new.task_id) into cycle_found;

  if cycle_found then
    raise exception 'Cycle detected: task % already (transitively) depends on task %, so % cannot also depend on it', new.depends_on_id, new.task_id, new.task_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_task_dependency_cycles on task_dependencies;
create trigger prevent_task_dependency_cycles
  before insert or update on task_dependencies
  for each row
  execute function public.prevent_task_dependency_cycles();

-- ============================================================
-- Verification - run after the block above
-- ============================================================

-- 1. Confirm both triggers are attached and enabled, in the expected order:
select tgname, tgrelid::regclass, tgenabled
from pg_trigger
where tgname in ('enforce_task_dependency_project_consistency', 'prevent_task_dependency_cycles')
order by tgname;
-- expect 2 rows, both tgenabled = 'O' - enforce_... then prevent_... alphabetically

-- 2. Live behavioral test, wrapped so it leaves no trace: creates 3 real
--    scratch tasks under one existing project, links A -> B -> C (valid,
--    no cycle), then attempts C -> A (which closes the cycle) and confirms
--    it's rejected. Rolls back at the end so nothing persists either way.
begin;

do $$
declare
  proj_a uuid;
  task_a uuid;
  task_b uuid;
  task_c uuid;
  cycle_rejected boolean := false;
begin
  select id into proj_a from projects order by created_at limit 1;

  if proj_a is null then
    raise notice 'SKIPPED: need at least 1 project to run this test.';
    return;
  end if;

  insert into tasks (project_id, title) values (proj_a, '__cycle_test_A__') returning id into task_a;
  insert into tasks (project_id, title) values (proj_a, '__cycle_test_B__') returning id into task_b;
  insert into tasks (project_id, title) values (proj_a, '__cycle_test_C__') returning id into task_c;

  -- A depends on B, B depends on C - both valid, no cycle yet
  insert into task_dependencies (task_id, depends_on_id) values (task_a, task_b);
  insert into task_dependencies (task_id, depends_on_id) values (task_b, task_c);

  -- C depends on A would close the cycle A -> B -> C -> A - must be rejected
  begin
    insert into task_dependencies (task_id, depends_on_id) values (task_c, task_a);
  exception
    when others then
      if sqlerrm like 'Cycle detected%' then
        cycle_rejected := true;
      else
        raise;
      end if;
  end;

  if cycle_rejected then
    raise notice 'PASS: 3-node cycle (A -> B -> C -> A) was correctly rejected by the trigger.';
  else
    raise exception 'FAIL: cycle insert succeeded - trigger did not reject it.';
  end if;
end $$;

rollback; -- discard the test tasks/dependencies - nothing persisted either way
