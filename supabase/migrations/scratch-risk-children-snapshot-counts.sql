select (select count(*) from risks_demo_snapshot) as risks,
       (select count(*) from risk_notes_demo_snapshot) as risk_notes,
       (select count(*) from risk_tasks_demo_snapshot) as risk_tasks;
