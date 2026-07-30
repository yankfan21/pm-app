select id, task_id, status, attempts, created_at, sent_at
from task_reminder_queue
order by created_at asc;
