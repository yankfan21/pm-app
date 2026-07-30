declare
  rec record;
  v_days_until_due integer;
  v_reminder_event text;
  v_reminder_label text;
  v_assignee_email text;
  v_request_id bigint;
  v_collected net.http_response_result;
begin
  for rec in
    -- Rule A: Waterfall/Hybrid Gantt tasks (not in a sprint)
    select t.id as task_id, t.project_id, t.title, t.due_date,
           t.assignee_user_id, t.assignee_name,
           p.owner_id, p.owner_email
    from tasks t
    join projects p on p.id = t.project_id
    where t.sprint_id is null
      and t.task_type = 'task'
      and t.status <> 'completed'
      and t.due_date is not null
      and (
        (t.due_date - current_date) in (3, 1)
        or t.due_date < current_date
      )

    union all

    -- Rule B: in-sprint items (Agile or Hybrid) pulled onto the sprint board
    select t.id as task_id, t.project_id, t.title, t.due_date,
           t.assignee_user_id, t.assignee_name,
           p.owner_id, p.owner_email
    from tasks t
    join projects p on p.id = t.project_id
    where t.sprint_id is not null
      -- board_status is nullable (sprint_board_schema.sql - an item can be
      -- pulled into a sprint before ever being moved on the Kanban board, so
      -- board_status starts null, not 'todo'). `<> 'done'` alone would
      -- silently exclude those never-yet-boarded rows (NULL <> 'done' is
      -- NULL, not true, in a WHERE clause) - explicitly treating null as
      -- "not done" here.
      and (t.board_status is null or t.board_status <> 'done')
      and t.due_date is not null
      and (
        (t.due_date - current_date) in (3, 1)
        or t.due_date < current_date
      )
  loop
    v_days_until_due := rec.due_date - current_date;

    if v_days_until_due = 3 then
      v_reminder_event := 'task_due_soon';
      v_reminder_label := 'in 3 days';
    elsif v_days_until_due = 1 then
      v_reminder_event := 'task_due_soon';
      v_reminder_label := 'tomorrow';
    else
      v_reminder_event := 'task_overdue';
      v_reminder_label := abs(v_days_until_due) || ' day' || (case when abs(v_days_until_due) = 1 then '' else 's' end) || ' overdue';
    end if;

    -- Assignee, if a real user is attached.
    if rec.assignee_user_id is not null then
      select email into v_assignee_email from auth.users where id = rec.assignee_user_id;
      if v_assignee_email is null then
        raise notice 'send_task_due_reminders: no auth.users row for assignee_user_id % on task %, skipping', rec.assignee_user_id, rec.task_id;
      else
        v_request_id := net.http_post(
          url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object(
            'event_type', v_reminder_event,
            'recipient_user_id', rec.assignee_user_id,
            'recipient_email', v_assignee_email,
            'task_id', rec.task_id,
            'task_title', rec.title,
            'project_id', rec.project_id,
            'project_name', (select name from projects where id = rec.project_id),
            'due_date', rec.due_date,
            'reminder_label', v_reminder_label
          ),
          timeout_milliseconds := 10000
        );

        v_collected := net.http_collect_response(v_request_id, async := false);
        raise notice 'send_task_due_reminders: assignee send for task % - pg_net status=%, http status=%',
          rec.task_id, (v_collected).status, (v_collected).response.status_code;
      end if;
    elsif rec.assignee_name is not null then
      raise notice 'send_task_due_reminders: task % assigned via free-text assignee_name (%), no user_id - skipping assignee notification', rec.task_id, rec.assignee_name;
    end if;

    -- Project owner, if the project has one (unclaimed projects have
    -- owner_id null - nothing to notify) and isn't the same person as the
    -- assignee (avoid sending the same reminder twice to one inbox).
    if rec.owner_id is not null and rec.owner_id is distinct from rec.assignee_user_id then
      v_request_id := net.http_post(
        url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'event_type', v_reminder_event,
          'recipient_user_id', rec.owner_id,
          'recipient_email', rec.owner_email,
          'task_id', rec.task_id,
          'task_title', rec.title,
          'project_id', rec.project_id,
          'project_name', (select name from projects where id = rec.project_id),
          'due_date', rec.due_date,
          'reminder_label', v_reminder_label
        ),
        timeout_milliseconds := 10000
      );

      v_collected := net.http_collect_response(v_request_id, async := false);
      raise notice 'send_task_due_reminders: owner send for task % - pg_net status=%, http status=%',
        rec.task_id, (v_collected).status, (v_collected).response.status_code;
    end if;
  end loop;
end;
