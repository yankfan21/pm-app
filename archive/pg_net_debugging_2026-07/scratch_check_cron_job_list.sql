-- Scratch check only, not part of migration history. Lists every pg_cron job
-- currently scheduled, so live state can be confirmed against what the
-- migration files define (task_notification_cron.sql, demo_projects_nightly_reset.sql).

select jobid, jobname, schedule, active, command
from cron.job
order by jobname;
