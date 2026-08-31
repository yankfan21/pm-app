select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('risks_demo_snapshot', 'risk_notes_demo_snapshot', 'risk_tasks_demo_snapshot');
