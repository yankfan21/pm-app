-- Fixes drain_task_reminder_queue() calling net.http_collect_response,
-- pg_net's public wrapper, which is broken in this project's installed
-- version - its own body is missing a RETURN/INTO, so every call throws
-- "query has no destination for result data" instead of returning the
-- collected response.
--
-- Fix: call net._http_collect_response (the underscore-prefixed internal
-- function the wrapper is supposed to delegate to) directly, at both call
-- sites - the first send attempt and the retry-on-429 branch. Nothing else
-- in the function changes: same v_collected declaration, same pg_sleep(0.12)
-- pacing, same retry/429 logic, same status_code checks.
--
-- create or replace function, so this is safe to run regardless of prior
-- state - no DROP needed.

create or replace function public.drain_task_reminder_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_request_id bigint;
  v_collected net.http_response_result;
begin
  for rec in
    select id, task_id, recipient_user_id, recipient_email, event_type,
           task_title, project_id, project_name, due_date, reminder_label, attempts
    from task_reminder_queue
    where status = 'pending'
    order by created_at asc
    limit 25
  loop
    v_request_id := net.http_post(
      url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'event_type', rec.event_type,
        'recipient_user_id', rec.recipient_user_id,
        'recipient_email', rec.recipient_email,
        'task_id', rec.task_id,
        'task_title', rec.task_title,
        'project_id', rec.project_id,
        'project_name', rec.project_name,
        'due_date', rec.due_date,
        'reminder_label', rec.reminder_label
      ),
      timeout_milliseconds := 10000
    );

    v_collected := net._http_collect_response(v_request_id, async := false);
    perform pg_sleep(0.12);

    if (v_collected).response.status_code = 429 then
      raise notice 'drain_task_reminder_queue: queue row % got 429, retrying once after 1s', rec.id;
      perform pg_sleep(1);

      v_request_id := net.http_post(
        url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'event_type', rec.event_type,
          'recipient_user_id', rec.recipient_user_id,
          'recipient_email', rec.recipient_email,
          'task_id', rec.task_id,
          'task_title', rec.task_title,
          'project_id', rec.project_id,
          'project_name', rec.project_name,
          'due_date', rec.due_date,
          'reminder_label', rec.reminder_label
        ),
        timeout_milliseconds := 10000
      );

      v_collected := net._http_collect_response(v_request_id, async := false);
      perform pg_sleep(0.12);
    end if;

    if (v_collected).response.status_code between 200 and 299 then
      update task_reminder_queue
      set status = 'sent', sent_at = now(), attempts = attempts + 1
      where id = rec.id;
      raise notice 'drain_task_reminder_queue: queue row % sent - pg_net status=%, http status=%',
        rec.id, (v_collected).status, (v_collected).response.status_code;
    else
      update task_reminder_queue
      set status = 'failed', attempts = attempts + 1
      where id = rec.id;
      raise notice 'drain_task_reminder_queue: queue row % failed - pg_net status=%, http status=%',
        rec.id, (v_collected).status, (v_collected).response.status_code;
    end if;
  end loop;
end;
$$;

revoke all on function public.drain_task_reminder_queue() from public, anon, authenticated;

-- Verify afterward:
--
--   select public.drain_task_reminder_queue();
--   select status, count(*) from task_reminder_queue group by status;
--
-- Expect raise notices with http status=200 (or whatever the Edge Function
-- returns) instead of the prior "query has no destination for result data"
-- error.
