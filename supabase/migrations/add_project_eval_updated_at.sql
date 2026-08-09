-- Adds updated_at to project_evaluations, so the Overview "Update Progress"
-- button can persist a freshly computed metrics object onto the latest
-- evaluation row and the UI can tell the two timestamps apart.
--
-- Background: project_evaluations.sql deliberately shipped without an
-- updated_at ("each evaluation is an immutable, timestamped diagnostic
-- snapshot, not something the PM edits"). That contract is now narrowed
-- rather than abandoned: the LLM-authored side of an evaluation
-- (health_status, rationale, recommendations) is still immutable and still
-- only ever written by an INSERT from the full evaluate path. The one
-- column that can now change after the fact is `metrics`, which is not
-- LLM output at all - it's exact arithmetic over current project rows, and
-- a PM refreshing it is asking for exactly that number to be kept.
--
-- Nullable with NO default, on purpose. NULL means "never refreshed since
-- the evaluation was written", which is what every existing row is and
-- what the Progress card reads to decide whether to show a second
-- "Progress updated ..." line at all. A default of now() would backfill
-- every historical row with a refresh that never happened.
--
-- No trigger either: the only writer is project-eval's metrics_only branch,
-- which sets this explicitly alongside metrics. A blanket BEFORE UPDATE
-- trigger would also stamp unrelated edits (and the demo-reset restore),
-- which would make the "Progress updated" line lie.

alter table project_evaluations add column if not exists updated_at timestamptz;

-- The demo-reset snapshot table has to follow. It was created with
-- `like project_evaluations including defaults` (demo_projects_nightly_reset.sql),
-- which copies the shape ONCE - `create table if not exists` won't re-derive
-- it now, so without this it stays one column short.
--
-- Restore would survive that (`insert into project_evaluations select * from
-- ..._demo_snapshot` maps the shorter list onto the leading columns and lets
-- updated_at default to NULL), but CAPTURE would not: `insert into
-- ..._demo_snapshot select * from project_evaluations` would raise "INSERT
-- has more expressions than target columns" the next time Scott re-bakes the
-- demo baseline. Capture is the manual, easy-to-forget direction, which is
-- exactly why it's fixed here rather than discovered later.
--
-- Guarded on the table existing so this migration is safe to run against an
-- environment that never installed the demo reset.
do $$
begin
  if to_regclass('public.project_evaluations_demo_snapshot') is not null then
    alter table project_evaluations_demo_snapshot add column if not exists updated_at timestamptz;
  end if;
end
$$;

-- Verify afterward:
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'project_evaluations'
--   order by ordinal_position;
--
-- Expect: an updated_at row, timestamptz, is_nullable = YES, no default.
-- Every existing evaluation keeps updated_at NULL.
--
-- And that the snapshot table matched:
--
--   select count(*) from information_schema.columns
--   where table_name = 'project_evaluations_demo_snapshot' and column_name = 'updated_at';
--
-- Expect: 1.
