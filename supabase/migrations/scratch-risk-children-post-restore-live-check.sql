select 'risks' as tbl, count(*) from risks r join projects p on p.id = r.project_id where p.is_demo = true
union all
select 'risk_notes', count(*) from risk_notes rn join projects p on p.id = rn.project_id where p.is_demo = true
union all
select 'risk_tasks', count(*) from risk_tasks rt join risks r on r.id = rt.risk_id join projects p on p.id = r.project_id where p.is_demo = true;
