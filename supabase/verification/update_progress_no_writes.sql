-- Verification for the Overview "Update Progress" button (project-eval's
-- metrics_only action). NOT a migration - nothing here writes anything.
--
-- What this button guarantees has NARROWED. It used to write nothing at
-- all; it now persists its recomputed metrics onto the LATEST existing
-- project_evaluations row (add_project_eval_updated_at.sql). What it still
-- guarantees, and what these queries prove:
--   - no NEW project_evaluations row (no document is minted)
--   - no ai_usage_log row (no Anthropic tokens are spent)
--   - health_status / rationale / recommendations / created_at unchanged
--     on the row it does touch
--
-- How to use: note the output BEFORE clicking Update Progress on a project,
-- click the button a few times on Waterfall/Agile/Hybrid, then run again.
-- Query 1's row COUNT and created_at must be identical while metrics /
-- updated_at move; query 2 must be byte-identical; query 3 must be empty
-- both times. Then run "+ Evaluate Project" once and run again - the count
-- and the token log must each go up by exactly 1, confirming the full flow
-- is untouched.
--
-- Supabase's SQL editor only shows the LAST statement's output, so run these
-- ONE AT A TIME (highlight the query, click Run - not Ctrl+Enter).


-- QUERY 1 - project_evaluations rows per project, newest first.
-- Update Progress must not change evaluation_rows or newest_created; it
-- MAY move newest_updated (that's the feature).

select
  p.name             as project_name,
  p.methodology,
  count(e.id)        as evaluation_rows,
  max(e.created_at)  as newest_created,
  max(e.updated_at)  as newest_updated
from projects p
left join project_evaluations e on e.project_id = p.id
group by p.id, p.name, p.methodology
order by newest_created desc nulls last;


-- QUERY 2 - project-eval token spend. Update Progress must not add a row
-- here (the metrics_only branch returns before callClaude/logUsage).

select
  date_trunc('minute', created_at) as minute,
  project_id,
  input_tokens,
  output_tokens
from ai_usage_log
where function_name = 'project-eval'
order by created_at desc
limit 20;


-- QUERY 3 - the narrative side must never be touched by a metrics refresh.
-- Any row where the LLM-authored fields went missing/empty on a row that
-- has been refreshed is a bug in persistMetricsOnLatestEvaluation. Must
-- return zero rows.

select
  e.id,
  p.name as project_name,
  e.created_at,
  e.updated_at,
  e.health_status,
  e.rationale is null      as rationale_missing,
  e.recommendations        as recommendations
from project_evaluations e
join projects p on p.id = e.project_id
where e.updated_at is not null
  and (
    e.health_status is null
    or e.rationale is null
    or e.recommendations is null
    or jsonb_array_length(coalesce(e.recommendations, '[]'::jsonb)) = 0
  )
order by e.updated_at desc;


-- QUERY 4 - which rows a metrics refresh has actually touched, and what
-- they now carry. Useful for eyeballing that the metrics shape matches the
-- project's methodology (Waterfall: task_pct_complete only; Agile: the
-- three velocity_* keys; Hybrid: both plus milestone_pct_complete).

select
  p.name as project_name,
  p.methodology,
  e.created_at,
  e.updated_at,
  e.metrics
from project_evaluations e
join projects p on p.id = e.project_id
where e.updated_at is not null
order by e.updated_at desc
limit 20;
