-- Scratch check only, not part of migration history. Confirms the exact
-- net.http_post() signature installed in THIS project (pg_net version can
-- differ from generic docs) before raising the 5000ms default timeout used
-- in send_task_due_reminders() (task_notification_cron_ratelimit_fix.sql).
select p.proname, pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'net' and p.proname = 'http_post';
