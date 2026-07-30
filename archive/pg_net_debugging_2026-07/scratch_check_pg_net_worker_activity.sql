-- Query 2: pg_net background worker activity in pg_stat_activity
select pid, application_name, state, wait_event_type, wait_event, query, query_start, state_change
from pg_stat_activity
where application_name ilike '%pg_net%'
   or query ilike '%pg_net%'
   or application_name ilike '%background worker%';
