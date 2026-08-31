-- Scratch check (not a real migration) - row counts for risks/risk_notes/
-- risk_tasks on the 3 demo projects, plus confirmation no shadow tables
-- exist yet for these child tables. Paste results back.

select 'risks' as tbl, count(*) from risks r
  join projects p on p.id = r.project_id where p.is_demo = true
union all
select 'risk_notes', count(*) from risk_notes rn
  join projects p on p.id = rn.project_id where p.is_demo = true
union all
select 'risk_tasks', count(*) from risk_tasks rt
  join risks r on r.id = rt.risk_id
  join projects p on p.id = r.project_id where p.is_demo = true;

-- Confirm no shadow tables exist yet (expect 0 rows):
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('risks_demo_snapshot', 'risk_notes_demo_snapshot', 'risk_tasks_demo_snapshot');
