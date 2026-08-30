-- Adds stakeholder_registries.suggestions_run_at, tracking whether the
-- assistant-suggestion feature (parse Charter Stakeholders text -> propose
-- stakeholders for accept/reject) has auto-fired once for this registry.
--
-- Nullable with NO default, on purpose. NULL means "never auto-fired yet",
-- which is what every existing row is and what the auto-trigger condition
-- checks. Set once, on first fire (success OR empty result), so it never
-- re-fires automatically again - even if the PM rejects every suggestion and
-- the registry is back to zero stakeholders. A default of now() would mark
-- every existing registry as already-fired, which is wrong: none of them
-- have run the feature yet. After this column is set once it is never
-- cleared or reset by any trigger; only a future manual "Re-run Suggestions"
-- action writes to stakeholders past this point, and that action does not
-- touch this column at all - it's an auto-fire-once gate, not a run counter.

alter table stakeholder_registries add column if not exists suggestions_run_at timestamptz;

-- The demo-reset snapshot table has to follow, same reasoning as
-- add_project_eval_updated_at.sql: it was created with `like
-- stakeholder_registries including defaults` (stakeholder_registry_schema.sql),
-- which copies the shape ONCE - `create table if not exists` won't re-derive
-- it now, so without this it stays one column short and a future
-- capture_demo_snapshot() run raises "INSERT has more expressions than
-- target columns".
--
-- Guarded on the table existing so this migration is safe to run against an
-- environment that never installed the demo reset.
do $$
begin
  if to_regclass('public.stakeholder_registries_demo_snapshot') is not null then
    alter table stakeholder_registries_demo_snapshot add column if not exists suggestions_run_at timestamptz;
  end if;
end
$$;

-- Verify afterward:
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'stakeholder_registries'
--   order by ordinal_position;
--
-- Expect: a suggestions_run_at row, timestamptz, is_nullable = YES, no default.
-- Every existing registry keeps suggestions_run_at NULL.
--
-- And that the snapshot table matched:
--
--   select count(*) from information_schema.columns
--   where table_name = 'stakeholder_registries_demo_snapshot' and column_name = 'suggestions_run_at';
--
-- Expect: 1.
