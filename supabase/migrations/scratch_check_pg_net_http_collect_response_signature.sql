-- Scratch check only, not part of migration history. Confirms the exact
-- net.http_collect_response() signature AND its return type's shape
-- installed in THIS project, before send_task_due_reminders() is changed to
-- call it synchronously after each net.http_post (replacing the pg_sleep
-- pacing, which only paces queuing, not actual delivery - see
-- task_notification_cron_ratelimit_fix_v2.sql history). pg_net's API for
-- this function has changed across versions (some versions don't have it at
-- all, older ones return a bare record, newer ones a composite
-- net.http_response_result with status/message/response fields) - same
-- reason net.http_post's signature was confirmed live rather than assumed
-- from generic docs.

select p.proname, pg_get_function_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'net' and p.proname = 'http_collect_response';

-- If the query above returns a row whose return_type references a composite
-- type (e.g. net.http_response_result), also run this to see that type's
-- actual columns:
--
--   select a.attname, format_type(a.atttypid, a.atttypmod) as type
--   from pg_attribute a
--   join pg_type t on t.oid = a.atttypid
--   join pg_namespace n on n.oid = t.typnamespace
--   where n.nspname = 'net' and a.attnum > 0 and not a.attisdropped
--   order by t.typname, a.attnum;
