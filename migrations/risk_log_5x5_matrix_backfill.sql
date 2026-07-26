-- One-time backfill for the Risk Log 5x5 Likelihood x Severity matrix
-- rollout. Run manually via the Supabase SQL editor (click Run) - not part
-- of the automated nightly demo reset.
--
-- Converts every risk row still in the old shape
--   { likelihood: 'Low'|'Medium'|'High', impact: 'Low'|'Medium'|'High', ... }
-- to the new shape
--   { likelihood: 1-5, severity: 1-5, ... }
-- defaulting to Likelihood 3 / Severity 3 (Score 9, Medium band) since
-- there's no reliable way to infer a real 1-5 score from a 3-level literal.
-- Any other keys on the risk object (risk, mitigation, owner, id, task_id)
-- are left untouched.
--
-- Covers both the live risk_logs table and risk_logs_demo_snapshot (the
-- static snapshot demo_projects_nightly_reset.sql restores from every
-- night) - the snapshot needs this too, or the nightly reset will keep
-- re-introducing old-shape rows on the 3 demo projects.
--
-- Run once, before any PM does manual re-scoring in the new UI - this does
-- not try to preserve a partial numeric value if a row is somehow already
-- half-migrated (has one of likelihood/severity numeric already); it
-- overwrites both to 3/3 whenever it detects the legacy shape.

-- Preview first: how many risk rows (by project) still carry the legacy
-- shape (a string likelihood, or a lingering "impact" key).
select project_id, jsonb_array_length(risks) as risk_count
from risk_logs
where exists (
  select 1 from jsonb_array_elements(risks) elem
  where jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
);

select project_id, jsonb_array_length(risks) as risk_count
from risk_logs_demo_snapshot
where exists (
  select 1 from jsonb_array_elements(risks) elem
  where jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
);

-- Backfill: live risk_logs
update risk_logs
set risks = (
  select jsonb_agg(
    case
      when jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
        then (elem - 'impact') || jsonb_build_object('likelihood', 3, 'severity', 3)
      else elem
    end
  )
  from jsonb_array_elements(risks) elem
),
updated_at = now()
where exists (
  select 1 from jsonb_array_elements(risks) elem
  where jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
);

-- Backfill: risk_logs_demo_snapshot (same transform, no updated_at column
-- semantics to worry about here beyond what's already in the snapshotted
-- jsonb)
update risk_logs_demo_snapshot
set risks = (
  select jsonb_agg(
    case
      when jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
        then (elem - 'impact') || jsonb_build_object('likelihood', 3, 'severity', 3)
      else elem
    end
  )
  from jsonb_array_elements(risks) elem
)
where exists (
  select 1 from jsonb_array_elements(risks) elem
  where jsonb_typeof(elem->'likelihood') = 'string' or elem ? 'impact'
);
