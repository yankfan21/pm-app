-- Scratch check only, not part of migration history. Pulls live prosrc for
-- send_task_due_reminders() so we can diff against
-- task_notification_cron_sync_fix.sql and confirm what's actually deployed.

select prosrc
from pg_proc
where proname = 'send_task_due_reminders';
