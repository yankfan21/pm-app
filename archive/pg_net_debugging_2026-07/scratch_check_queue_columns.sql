select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'task_reminder_queue'
order by ordinal_position;
