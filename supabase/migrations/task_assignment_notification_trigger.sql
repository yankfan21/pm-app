-- STEP 3 of "Automated task notifications via Resend". Fires the
-- send-task-notification Edge Function (see supabase/functions/send-task-notification)
-- whenever a task/backlog row's assignee_user_id is set to a real user - on
-- INSERT (task created pre-assigned) or UPDATE (assigned/reassigned later).
--
-- Requires enable_pg_net.sql to have already been run - this migration calls
-- net.http_post(), which doesn't exist until pg_net is enabled.
--
-- "UPDATE OF assignee_user_id" fires whenever that column is touched by an
-- UPDATE's SET list at all (Postgres semantics - regardless of whether the
-- value actually changed), so a save that re-sends the same assignee still
-- fires this. Acceptable: worst case is a redundant "you've been assigned"
-- email on an unrelated field edit that happens to also re-send
-- assignee_user_id in its payload (e.g. a full-row form save) - not filtered
-- out below to keep this trigger simple, flagging it as a known possible
-- over-send rather than silently declaring it handled.
--
-- Only the assignee is notified here - NOT the project owner (unlike the
-- cron job in task_notification_cron.sql, which notifies both). Matches the
-- spec for this step directly.
--
-- assignee_name (free-text, no user_id - see tasks_assignee.sql) is
-- deliberately not notified; there's no email to send it to. Logged via
-- raise notice instead of silently doing nothing, so this case is visible in
-- Postgres logs if someone goes looking for why a contractor never got an
-- email.

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_project_name text;
begin
  if new.assignee_user_id is null then
    if new.assignee_name is not null then
      raise notice 'notify_task_assignment: task % assigned via free-text assignee_name (%), no user_id - skipping notification', new.id, new.assignee_name;
    end if;
    return new;
  end if;

  -- On UPDATE, only notify if assignee_user_id actually changed to this
  -- value - avoids re-notifying on every unrelated save that happens to
  -- resend the same assignee_user_id.
  if tg_op = 'UPDATE' and old.assignee_user_id is not distinct from new.assignee_user_id then
    return new;
  end if;

  select email into v_email from auth.users where id = new.assignee_user_id;
  if v_email is null then
    raise notice 'notify_task_assignment: no auth.users row for assignee_user_id % on task %, skipping', new.assignee_user_id, new.id;
    return new;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  perform net.http_post(
    url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event_type', 'task_assigned',
      'recipient_user_id', new.assignee_user_id,
      'recipient_email', v_email,
      'task_id', new.id,
      'task_title', new.title,
      'project_id', new.project_id,
      'project_name', v_project_name,
      'due_date', new.due_date,
      'reminder_label', null
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_task_assignment on tasks;
create trigger notify_task_assignment
  after insert or update of assignee_user_id on tasks
  for each row
  execute function public.notify_task_assignment();

-- Verify afterward:
--
--   select tgname, tgrelid::regclass, tgenabled
--   from pg_trigger
--   where tgname = 'notify_task_assignment';
--   -- expect exactly one row, tgenabled = 'O'
--
-- Live test (assign yourself a real task, then check pg_net logged the
-- outbound call):
--
--   select id, url, status_code, created
--   from net._http_response
--   order by created desc
--   limit 5;
