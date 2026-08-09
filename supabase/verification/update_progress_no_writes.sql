-- Verification for the Overview "Update Progress" button (project-eval's
-- metrics_only action). NOT a migration - nothing here writes anything.
--
-- The whole point of the button is that it produces no document and costs
-- no Anthropic tokens: no project_evaluations row, no ai_usage_log row.
-- These two queries are how to prove that from the database side.
--
-- How to use: note the counts BEFORE clicking Update Progress on a project,
-- click the button a few times on Waterfall/Agile/Hybrid, then run again.
-- Both numbers must be identical. Then run "+ Evaluate Project" once and
-- run again - both must go up by exactly 1, confirming the old flow is
-- untouched.
--
-- Supabase's SQL editor only shows the LAST statement's output, so run these
-- ONE AT A TIME (highlight the query, click Run - not Ctrl+Enter).


-- QUERY 1 - project_evaluations rows per project, newest first.
-- Update Progress must not add a row here.

select
  p.name             as project_name,
  p.methodology,
  count(e.id)        as evaluation_rows,
  max(e.created_at)  as newest_evaluation
from projects p
left join project_evaluations e on e.project_id = p.id
group by p.id, p.name, p.methodology
order by newest_evaluation desc nulls last;


-- QUERY 2 - project-eval token spend. Update Progress must not add a row
-- here either (the metrics_only branch returns before callClaude/logUsage).

select
  date_trunc('minute', created_at) as minute,
  project_id,
  input_tokens,
  output_tokens
from ai_usage_log
where function_name = 'project-eval'
order by created_at desc
limit 20;
