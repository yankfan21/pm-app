-- Excludes the 3 shared demo projects (projects.is_demo = true) from
-- send_task_due_reminders(). Demo project tasks get wiped/reinserted every
-- night by restore_demo_projects() (demo_projects_nightly_reset.sql), so
-- their due dates are meaningless churn - real users were getting reminder
-- emails for tasks on projects they don't actually own/work on.
--
-- Only change: "and p.is_demo = false" added to both Rule A and Rule B
-- WHERE clauses, alongside the existing t.due_date is not null check.
-- Dedup guards (add_task_reminder_dedup_guard.sql) and the 1-day overdue
-- interval (update_overdue_reminder_frequency_daily.sql) are unchanged.

create or replace function public.send_task_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_days_until_due integer;
  v_reminder_event text;
  v_reminder_label text;
  v_assignee_email text;
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
      and p.is_demo = false
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
      and p.is_demo = false
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
      elsif not exists (
        select 1 from task_reminder_queue existing
        where existing.task_id = rec.task_id
          and existing.recipient_user_id = rec.assignee_user_id
          and (
            (v_reminder_event = 'task_due_soon' and existing.event_type = 'task_due_soon' and existing.reminder_label = v_reminder_label)
            or
            (v_reminder_event = 'task_overdue' and existing.event_type = 'task_overdue' and existing.created_at > now() - interval '1 day')
          )
      ) then
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.assignee_user_id, v_assignee_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      else
        raise notice 'send_task_due_reminders: assignee already queued for task % / % within dedup window, skipping', rec.task_id, v_reminder_event;
      end if;
    elsif rec.assignee_name is not null then
      raise notice 'send_task_due_reminders: task % assigned via free-text assignee_name (%), no user_id - skipping assignee notification', rec.task_id, rec.assignee_name;
    end if;

    -- Project owner, if the project has one (unclaimed projects have
    -- owner_id null - nothing to notify) and isn't the same person as the
    -- assignee (avoid sending the same reminder twice to one inbox).
    if rec.owner_id is not null and rec.owner_id is distinct from rec.assignee_user_id then
      if rec.owner_email is null then
        raise notice 'send_task_due_reminders: no owner_email for project %, task %, skipping owner notification', rec.project_id, rec.task_id;
      elsif not exists (
        select 1 from task_reminder_queue existing
        where existing.task_id = rec.task_id
          and existing.recipient_user_id = rec.owner_id
          and (
            (v_reminder_event = 'task_due_soon' and existing.event_type = 'task_due_soon' and existing.reminder_label = v_reminder_label)
            or
            (v_reminder_event = 'task_overdue' and existing.event_type = 'task_overdue' and existing.created_at > now() - interval '1 day')
          )
      ) then
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.owner_id, rec.owner_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      else
        raise notice 'send_task_due_reminders: owner already queued for task % / % within dedup window, skipping', rec.task_id, v_reminder_event;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- Verify afterward:
--
--   select public.send_task_due_reminders();
--   select task_id, project_id, event_type from task_reminder_queue
--   where project_id in (select id from projects where is_demo = true)
--   order by created_at desc limit 5; -- should return 0 rows post-run
