-- Standalone diagnostic: flags tasks whose sprint_id or milestone_id
-- belongs to a different project than tasks.project_id. Pulled out of
-- fix_enforce_task_project_consistency_null_not_reject.sql as its own file
-- so the Supabase SQL editor's result pane (which only surfaces one result
-- set per Run) shows it directly instead of getting displaced by an
-- earlier statement in that multi-statement script.
--
-- These are rows that went stale BEFORE the trigger existed - the trigger
-- only corrects a row when it's next written to, so this is read-only and
-- won't fix anything by itself. 0 rows back = nothing left to clean up.

select id, project_id, sprint_id, milestone_id
from tasks
where (sprint_id is not null and not exists (
        select 1 from sprints s where s.id = tasks.sprint_id and s.project_id = tasks.project_id))
   or (milestone_id is not null and not exists (
        select 1 from milestones m where m.id = tasks.milestone_id and m.project_id = tasks.project_id));
