-- Read-only inspection of the demo projects (no writes). Run in the Supabase SQL editor.
select 'projects' as what, id::text, name, methodology, status, deadline::text as a, created_at::text as b
from projects where is_demo
union all
select 'task summary', p.name, count(*)::text, min(t.start_date)::text, max(t.due_date)::text,
       count(*) filter (where t.task_type = 'milestone_marker')::text,
       string_agg(distinct coalesce(t.status, 'null'), ',')
from tasks t join projects p on p.id = t.project_id where p.is_demo group by p.name
union all
select 'dependencies', p.name, count(*)::text, null, null, null, null
from task_dependencies d join tasks t on t.id = d.task_id join projects p on p.id = t.project_id
where p.is_demo group by p.name
union all
select 'dep snapshot table exists', table_name, null, null, null, null, null
from information_schema.tables where table_name = 'task_dependencies_demo_snapshot'
union all
select 'phases', p.name, count(*)::text, min(ph.effective_start_date)::text, max(ph.effective_end_date)::text, null, null
from phases ph join projects p on p.id = ph.project_id where p.is_demo group by p.name
union all
select 'milestones', p.name, count(*)::text, min(m.start_date)::text, max(m.end_date)::text, null, null
from milestones m join projects p on p.id = m.project_id where p.is_demo group by p.name
union all
select 'sprints', p.name, count(*)::text, min(s.start_date)::text, max(s.end_date)::text, null, null
from sprints s join projects p on p.id = s.project_id where p.is_demo group by p.name
union all
select 'today', now()::date::text, null, null, null, null, null;
