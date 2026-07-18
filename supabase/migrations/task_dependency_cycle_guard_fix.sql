-- Fix for task_dependency_cycle_guard.sql.
--
-- The trigger function's logic is NOT the bug - hand-traced against the
-- reported repro (A depends_on B, B depends_on C, then C depends_on A):
-- the recursive walk starts at new.depends_on_id (A), follows existing
-- task_id -> depends_on_id edges forward (A -> B -> C), and new.task_id
-- (C) does show up in that walk, so cycle_found should evaluate true and
-- the exception should fire. That part checks out.
--
-- The bug is structural. task_dependency_cycle_guard.sql ends with:
--
--   begin;
--   do $$ ... $$;
--   rollback;
--
-- run in the same paste as the `create or replace function` / `create
-- trigger` statements above it. Per the Postgres simple-query protocol, a
-- multi-statement string submitted as one request runs as a SINGLE
-- transaction unless the string itself divides it with explicit
-- BEGIN/COMMIT - and issuing BEGIN while a transaction is already open
-- (which it implicitly is, from the very first CREATE OR REPLACE FUNCTION
-- statement onward, if the whole pasted script is sent as one request) is
-- a no-op: Postgres just warns "there is already a transaction in
-- progress" and keeps running in the SAME transaction rather than starting
-- a new one. So the trailing `rollback;` didn't just undo the test's
-- inserts - it rolled back the entire batch, taking the CREATE FUNCTION
-- and CREATE TRIGGER down with it. The trigger was created and then
-- immediately un-created in the same paste - consistent with the logic
-- looking right on paper but nothing happening live.
--
-- (Whether this is the confirmed cause or just the leading hypothesis
-- depends on what scratch-check-cycle-trigger-function.sql and
-- scratch-check-cycle-trigger-defs.sql come back with - run those first.
-- Either way, this fix removes the fragile pattern.)
--
-- Fix, two parts:
--   1. An explicit `commit;` immediately after the DDL, so even if the
--      whole script runs as one implicit transaction, the function/trigger
--      are checkpointed before anything downstream in this same paste can
--      roll them back.
--   2. The embedded behavioral test no longer uses begin/rollback for
--      cleanup at all - it deletes its own scratch rows explicitly
--      instead, so this file can't repeat the same class of bug regardless
--      of how the SQL editor happens to batch statements.

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

-- Checkpoint the DDL above before anything else in this script can touch
-- it. Harmless if there's no transaction open yet (just a "there is no
-- transaction in progress" warning); critical if the whole paste is
-- running as one implicit transaction, which is what broke the original
-- file.
commit;

-- ============================================================
-- Verification - run after the block above
-- ============================================================

-- 1. Confirm both triggers are attached, enabled, and BEFORE ROW:
select
  tgname,
  tgrelid::regclass as table_name,
  tgenabled,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgname in ('enforce_task_dependency_project_consistency', 'prevent_task_dependency_cycles')
order by tgname;
-- expect 2 rows, both tgenabled = 'O', both definitions starting with
-- "CREATE TRIGGER ... BEFORE INSERT OR UPDATE ... FOR EACH ROW"

-- 2. Behavioral test - creates 3 real scratch tasks under one existing
--    project, links A -> B -> C (valid, no cycle), then attempts C -> A
--    (which closes the cycle) and confirms it's rejected. Cleans up its
--    own rows with explicit deletes rather than a transaction rollback,
--    so cleanup can't accidentally undo the DDL above no matter how this
--    script is batched.
do $$
declare
  proj_a uuid;
  task_a uuid;
  task_b uuid;
  task_c uuid;
  cycle_rejected boolean := false;
  test_failed boolean;
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

  test_failed := not cycle_rejected;

  -- Explicit cleanup, not a rollback - runs regardless of pass/fail so it
  -- can never depend on (or interfere with) surrounding transaction state.
  delete from task_dependencies
  where task_id in (task_a, task_b, task_c) or depends_on_id in (task_a, task_b, task_c);
  delete from tasks where id in (task_a, task_b, task_c);

  if test_failed then
    raise exception 'FAIL: cycle insert succeeded - trigger did not reject it.';
  else
    raise notice 'PASS: 3-node cycle (A -> B -> C -> A) was correctly rejected by the trigger.';
  end if;
end $$;
