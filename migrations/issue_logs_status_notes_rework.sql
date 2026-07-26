-- Issues Log status/field rework. Run manually via the Supabase SQL editor
-- (click Run, not Ctrl+Enter) - not part of the automated nightly demo
-- reset.
--
-- For every issue_logs row, rebuilds each element of the `issues` jsonb
-- array from the old shape
--   { ..., status: 'Open'|'In Progress'|'Pending'|'Closed', resolution: text, resolution_date: date|null }
-- to the new shape
--   { ..., status: 'Open'|'In Progress'|'Blocked'|'Closed', status_notes: [{note, created_at}], last_update: timestamptz|null }
--
-- - status_notes seeds one entry from the old resolution text when it was
--   non-empty (empty resolution -> empty status_notes array, nothing to
--   seed).
-- - last_update: uses the old resolution_date when present. When absent
--   (issue never resolved), falls back to the issue_logs row's created_at -
--   not updated_at, since updated_at drifts every time ANY issue on the row
--   is touched and would misrepresent this specific issue as more recently
--   updated than it really was. created_at is stable and honestly says "we
--   don't actually know, this is just when the log was created." Flag: if
--   updated_at (or a hardcoded now()) is preferred instead, it's a one-line
--   swap below - say so before running if created_at looks wrong.
-- - status 'Pending' -> 'Blocked' (this also fixes the known Regional
--   Expansion / Tomas Reyes demo row - see fix_seed_demo_issue_logs.sql).
--
-- This migration touches only the live issue_logs table. It deliberately
-- does NOT touch issue_logs_demo_snapshot - after this is applied and
-- verified, re-run `select public.capture_demo_snapshot();` by hand (same
-- "STEP 2" pattern as seed_demo_issue_logs.sql) to rebake the new shape
-- into the nightly-reset baseline. That capture call is NOT included below
-- on purpose, per instruction to keep it a separate reviewed step.

-- Preview first: how many issue_logs rows still carry the legacy shape (a
-- "resolution" or "resolution_date" key present anywhere in the array).
select project_id, jsonb_array_length(issues) as issue_count
from issue_logs
where exists (
  select 1 from jsonb_array_elements(issues) elem
  where elem ? 'resolution' or elem ? 'resolution_date'
);

-- Backfill: live issue_logs
update issue_logs
set issues = (
  select jsonb_agg(
    (elem - 'resolution' - 'resolution_date')
    || jsonb_build_object(
      'status',
      case when elem->>'status' = 'Pending' then 'Blocked' else elem->>'status' end,
      'status_notes',
      case
        when coalesce(elem->>'resolution', '') <> ''
          then jsonb_build_array(
            jsonb_build_object(
              'note', elem->>'resolution',
              'created_at', coalesce(elem->>'resolution_date', to_char(issue_logs.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
            )
          )
        else '[]'::jsonb
      end,
      'last_update',
      coalesce(elem->>'resolution_date', to_char(issue_logs.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )
  )
  from jsonb_array_elements(issues) elem
),
updated_at = now()
where exists (
  select 1 from jsonb_array_elements(issues) elem
  where elem ? 'resolution' or elem ? 'resolution_date'
);

-- Verify afterward:
--
--   select project_id, issues from issue_logs;
--
--   -- should return 0 rows (no legacy keys left anywhere):
--   select project_id from issue_logs
--   where exists (
--     select 1 from jsonb_array_elements(issues) elem
--     where elem ? 'resolution' or elem ? 'resolution_date' or elem->>'status' = 'Pending'
--   );
--
-- Manual step after review, run separately:
--
--   select public.capture_demo_snapshot();
