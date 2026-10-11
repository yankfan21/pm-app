-- Demo projects: always "in progress right now" + every Gantt feature visible.
--
-- 1. Dynamic dates. capture_demo_snapshot() now records the capture day in
--    demo_snapshot_meta; restore_demo_projects() (nightly, 08:00 UTC) shifts
--    every demo date (tasks, phases, milestones, sprints, project deadline)
--    by the whole days elapsed since then. Issue/risk/charter dates are not
--    shifted (free-form content).
-- 2. Dependencies. task_dependencies was never part of the snapshot, and its
--    on-delete-cascade FKs meant the nightly task delete wiped every demo
--    dependency without restoring any. It is now captured and restored.
-- 3. Showcase data. Reshapes tasks of the waterfall/hybrid demo projects IN
--    PLACE (existing rows are updated, never dropped; short projects are
--    topped up to 14 tasks by cloning a row): ~15 days of history and ~20
--    ahead, two parallel dependency streams that join (a task with several
--    predecessors, so the critical path has something to find), three
--    milestone markers, and all four statuses (completed, in progress,
--    not started, one delayed). Phases, milestones, sprints and the project
--    deadline are re-dated to match. The agile demo is only date-shifted.
--
-- Ends by capturing a new baseline, so run it once; the nightly job keeps
-- the dates current after that. NOT yet run anywhere.

create table if not exists demo_snapshot_meta (
  id integer primary key default 1 check (id = 1),
  anchor_date date not null
);
alter table demo_snapshot_meta enable row level security;

create table if not exists task_dependencies_demo_snapshot (like task_dependencies including defaults);
alter table task_dependencies_demo_snapshot enable row level security;

create or replace function public.verify_demo_snapshot_schema()
returns void
language plpgsql
as $$
declare
  tracked_tables text[] := array[
    'projects', 'milestones', 'sprints', 'phases', 'tasks', 'sprint_retros',
    'charters', 'requirements_briefs', 'risk_logs', 'issue_logs', 'scopings',
    'exec_comms_plans', 'team_newsletters', 'budget_trackers', 'status_updates',
    'document_versions', 'post_mortems', 'project_evaluations',
    'stakeholder_registries', 'stakeholders',
    'risks', 'risk_notes', 'risk_tasks', 'task_dependencies'
  ];
  t text;
  live_cols text[];
  snap_cols text[];
  missing text[];
begin
  foreach t in array tracked_tables loop
    select array_agg(column_name order by column_name) into live_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t;

    select array_agg(column_name order by column_name) into snap_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t || '_demo_snapshot';

    if snap_cols is null then
      raise exception 'verify_demo_snapshot_schema: % has no matching %_demo_snapshot table', t, t;
    end if;

    select array_agg(c) into missing from unnest(live_cols) c where c <> all(snap_cols);

    if missing is not null then
      raise exception
        'verify_demo_snapshot_schema: %_demo_snapshot is missing column(s) % present on % - add them (matching type, appended at the end) before capture/restore can run',
        t, missing, t;
    end if;
  end loop;
end;
$$;

create or replace function public.capture_demo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'capture_demo_snapshot: no rows in projects where is_demo = true';
  end if;

  truncate
    projects_demo_snapshot, milestones_demo_snapshot, sprints_demo_snapshot,
    phases_demo_snapshot, tasks_demo_snapshot, sprint_retros_demo_snapshot,
    charters_demo_snapshot, requirements_briefs_demo_snapshot, risk_logs_demo_snapshot,
    issue_logs_demo_snapshot, scopings_demo_snapshot,
    exec_comms_plans_demo_snapshot, team_newsletters_demo_snapshot,
    budget_trackers_demo_snapshot, status_updates_demo_snapshot,
    document_versions_demo_snapshot, post_mortems_demo_snapshot,
    project_evaluations_demo_snapshot,
    stakeholder_registries_demo_snapshot, stakeholders_demo_snapshot,
    risks_demo_snapshot, risk_notes_demo_snapshot, risk_tasks_demo_snapshot,
    task_dependencies_demo_snapshot;

  insert into projects_demo_snapshot select * from projects where id = any(demo_ids);
  insert into milestones_demo_snapshot select * from milestones where project_id = any(demo_ids);
  insert into sprints_demo_snapshot select * from sprints where project_id = any(demo_ids);
  insert into phases_demo_snapshot select * from phases where project_id = any(demo_ids);
  insert into tasks_demo_snapshot select * from tasks where project_id = any(demo_ids);
  insert into task_dependencies_demo_snapshot
    select d.* from task_dependencies d
    where d.task_id in (select id from tasks where project_id = any(demo_ids));

  insert into demo_snapshot_meta (id, anchor_date) values (1, current_date)
    on conflict (id) do update set anchor_date = excluded.anchor_date;

  insert into sprint_retros_demo_snapshot
    select sr.* from sprint_retros sr
    join sprints s on s.id = sr.sprint_id
    where s.project_id = any(demo_ids);

  insert into charters_demo_snapshot select * from charters where project_id = any(demo_ids);
  insert into requirements_briefs_demo_snapshot select * from requirements_briefs where project_id = any(demo_ids);
  insert into risk_logs_demo_snapshot select * from risk_logs where project_id = any(demo_ids);
  insert into issue_logs_demo_snapshot select * from issue_logs where project_id = any(demo_ids);
  insert into scopings_demo_snapshot select * from scopings where project_id = any(demo_ids);
  insert into exec_comms_plans_demo_snapshot select * from exec_comms_plans where project_id = any(demo_ids);
  insert into team_newsletters_demo_snapshot select * from team_newsletters where project_id = any(demo_ids);
  insert into budget_trackers_demo_snapshot select * from budget_trackers where project_id = any(demo_ids);
  insert into status_updates_demo_snapshot select * from status_updates where project_id = any(demo_ids);
  insert into document_versions_demo_snapshot select * from document_versions where project_id = any(demo_ids);
  insert into post_mortems_demo_snapshot select * from post_mortems where project_id = any(demo_ids);
  insert into project_evaluations_demo_snapshot select * from project_evaluations where project_id = any(demo_ids);
  insert into stakeholder_registries_demo_snapshot select * from stakeholder_registries where project_id = any(demo_ids);
  insert into stakeholders_demo_snapshot select * from stakeholders where project_id = any(demo_ids);

  insert into risks_demo_snapshot select * from risks where project_id = any(demo_ids);
  insert into risk_notes_demo_snapshot select * from risk_notes where project_id = any(demo_ids);
  insert into risk_tasks_demo_snapshot
    select rt.* from risk_tasks rt
    where rt.risk_id in (select id from risks where project_id = any(demo_ids));
end;
$$;

revoke all on function public.capture_demo_snapshot() from public, anon, authenticated;

create or replace function public.restore_demo_projects()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
  shift_days integer;
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'restore_demo_projects: no rows in projects where is_demo = true - refusing to run';
  end if;

  if (select count(*) from projects_demo_snapshot where id = any(demo_ids)) <> array_length(demo_ids, 1) then
    raise exception 'restore_demo_projects: is_demo project set does not match projects_demo_snapshot - run capture_demo_snapshot() first';
  end if;

  -- delete: children before parents
  delete from sprint_retros where sprint_id in (select id from sprints where project_id = any(demo_ids));
  delete from tasks where project_id = any(demo_ids);
  delete from milestones where project_id = any(demo_ids);
  delete from sprints where project_id = any(demo_ids);
  delete from phases where project_id = any(demo_ids);
  delete from charters where project_id = any(demo_ids);
  delete from requirements_briefs where project_id = any(demo_ids);
  delete from risk_tasks where risk_id in (select id from risks where project_id = any(demo_ids));
  delete from risk_notes where project_id = any(demo_ids);
  delete from risks where project_id = any(demo_ids);
  delete from risk_logs where project_id = any(demo_ids);
  delete from issue_logs where project_id = any(demo_ids);
  delete from scopings where project_id = any(demo_ids);
  delete from exec_comms_plans where project_id = any(demo_ids);
  delete from team_newsletters where project_id = any(demo_ids);
  delete from budget_trackers where project_id = any(demo_ids);
  delete from status_updates where project_id = any(demo_ids);
  delete from document_versions where project_id = any(demo_ids);
  delete from post_mortems where project_id = any(demo_ids);
  delete from project_evaluations where project_id = any(demo_ids);
  delete from stakeholders where project_id = any(demo_ids);
  delete from stakeholder_registries where project_id = any(demo_ids);

  -- reinsert: parents before children
  insert into milestones select * from milestones_demo_snapshot;
  insert into sprints select * from sprints_demo_snapshot;

  insert into phases (
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  )
  select
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  from phases_demo_snapshot;

  insert into tasks select * from tasks_demo_snapshot;
  insert into task_dependencies select * from task_dependencies_demo_snapshot;

  insert into sprint_retros select * from sprint_retros_demo_snapshot;
  insert into charters select * from charters_demo_snapshot;
  insert into requirements_briefs select * from requirements_briefs_demo_snapshot;
  insert into risk_logs select * from risk_logs_demo_snapshot;

  insert into risks select * from risks_demo_snapshot;
  insert into risk_notes select * from risk_notes_demo_snapshot;
  insert into risk_tasks select * from risk_tasks_demo_snapshot;

  insert into issue_logs select * from issue_logs_demo_snapshot;
  insert into scopings select * from scopings_demo_snapshot;
  insert into exec_comms_plans select * from exec_comms_plans_demo_snapshot;
  insert into team_newsletters select * from team_newsletters_demo_snapshot;
  insert into budget_trackers select * from budget_trackers_demo_snapshot;
  insert into status_updates select * from status_updates_demo_snapshot;
  insert into document_versions select * from document_versions_demo_snapshot;
  insert into post_mortems select * from post_mortems_demo_snapshot;
  insert into project_evaluations select * from project_evaluations_demo_snapshot;
  insert into stakeholder_registries select * from stakeholder_registries_demo_snapshot;
  insert into stakeholders select * from stakeholders_demo_snapshot;

  update projects p
  set name = s.name,
      goal = s.goal,
      priority = s.priority,
      deadline = s.deadline,
      methodology = s.methodology,
      status = s.status,
      updated_at = s.updated_at
  from projects_demo_snapshot s
  where p.id = s.id;

  -- Slide every date by the number of whole days since the baseline was
  -- captured, so the demos always sit at the same place relative to today.
  select current_date - anchor_date into shift_days from demo_snapshot_meta where id = 1;
  if shift_days is not null and shift_days <> 0 then
    update tasks set
      start_date = start_date + shift_days * interval '1 day',
      due_date = due_date + shift_days * interval '1 day'
      where project_id = any(demo_ids);
    update phases set
      auto_start_date = auto_start_date + shift_days * interval '1 day',
      auto_end_date = auto_end_date + shift_days * interval '1 day',
      custom_start_date = custom_start_date + shift_days * interval '1 day',
      custom_end_date = custom_end_date + shift_days * interval '1 day'
      where project_id = any(demo_ids);
    update milestones set
      start_date = start_date + shift_days * interval '1 day',
      end_date = end_date + shift_days * interval '1 day'
      where project_id = any(demo_ids);
    update sprints set
      start_date = start_date + shift_days * interval '1 day',
      end_date = end_date + shift_days * interval '1 day'
      where project_id = any(demo_ids);
    update projects set deadline = deadline + shift_days * interval '1 day'
      where id = any(demo_ids);
  end if;
end;
$$;

revoke all on function public.restore_demo_projects() from public, anon, authenticated;


-- ── reshape waterfall / hybrid demo tasks ────────────────────────────────

do $$
declare
  p record;
  today date := current_date;
  ids uuid[];
  newid uuid;
  tpl tasks%rowtype;
  fill_titles text[] := array[
    'Kickoff and scope confirmation', 'Gather stakeholder requirements', 'Draft solution design',
    'Build core workflow', 'Integrate with existing systems', 'Prepare test plan',
    'Run user acceptance testing', 'Train the team', 'Prepare cutover plan',
    'Go-live support', 'Post-launch review', 'Update documentation', 'Finalize vendor handoff', 'Close out budget'
  ];
  marker_pos int[] := array[4, 9, 14];
  marker_titles text[] := array['Design approved', 'UAT starts', 'Go live'];
  marker_after int[] := array[3, 7, 11];
  nrm uuid[]; mrk uuid[];
  s int[]; e int[]; d int; k int; j int; pe int; st text; cnt int;
  ph uuid; off int; due_off int;
  tid uuid;
begin
  for p in select id from projects where is_demo = true and lower(methodology) in ('waterfall', 'hybrid') loop
    select array_agg(id order by start_date nulls last, due_date nulls last, created_at, id)
      into ids from tasks where project_id = p.id;
    if ids is null then
      raise notice 'demo project % has no tasks to reshape - skipped', p.id;
      continue;
    end if;
    select * into tpl from tasks where id = ids[1];

    while array_length(ids, 1) < 14 loop
      insert into tasks
        select (jsonb_populate_record(null::tasks, to_jsonb(tpl) || jsonb_build_object(
          'id', gen_random_uuid(), 'title', fill_titles[array_length(ids, 1) + 1],
          'depends_on', null, 'sprint_id', null, 'milestone_id', null))).*
      returning id into newid;
      ids := ids || newid;
    end loop;

    -- clear old dependencies for this project
    delete from task_dependencies where task_id in (select id from tasks where project_id = p.id);
    update tasks set depends_on = null where project_id = p.id;

    -- split the first 14 into 11 normal tasks and 3 markers
    nrm := '{}'; mrk := '{}';
    for k in 1..14 loop
      if k = any(marker_pos) then mrk := mrk || ids[k]; else nrm := nrm || ids[k]; end if;
    end loop;

    -- forward-schedule the 11 normal tasks as offsets from today
    s := array_fill(0, array[11]); e := array_fill(0, array[11]);
    for j in 1..11 loop
      d := 3 + (j % 3);
      if j = 1 then s[j] := -15;
      elsif j = 2 then s[j] := -13;
      else
        pe := e[j - 2];
        if j = 6 then pe := greatest(pe, e[5]); end if;
        if j = 11 then pe := greatest(pe, e[10]); end if;
        s[j] := pe + 1;
      end if;
      e[j] := s[j] + d;

      st := case
        when j = 5 then 'delayed'
        when e[j] < 0 then 'completed'
        when s[j] <= 0 then 'in_progress'
        else 'not_started' end;
      select id into ph from phases where project_id = p.id and phase_number =
        case when s[j] <= -9 then 1 when s[j] <= 0 then 2 when s[j] <= 13 then 3 else 4 end;
      update tasks set task_type = 'task', start_date = today + s[j], due_date = today + e[j],
        status = st, completed = (st = 'completed'), phase_id = ph
        where id = nrm[j];
      if j >= 3 then insert into task_dependencies (task_id, depends_on_id) values (nrm[j], nrm[j - 2]); end if;
      if j = 6 then insert into task_dependencies (task_id, depends_on_id) values (nrm[6], nrm[5]); end if;
      if j = 11 then insert into task_dependencies (task_id, depends_on_id) values (nrm[11], nrm[10]); end if;
    end loop;

    -- milestone markers (no start_date, per tasks_milestone_no_start_date_check)
    for k in 1..3 loop
      due_off := e[marker_after[k]] + case when k = 3 then 1 else 0 end;
      st := case when due_off < 0 then 'completed' else 'not_started' end;
      select id into ph from phases where project_id = p.id and phase_number =
        case when due_off <= -9 then 1 when due_off <= 0 then 2 when due_off <= 13 then 3 else 4 end;
      update tasks set task_type = 'milestone_marker', title = marker_titles[k], start_date = null,
        due_date = today + due_off, status = st, completed = (st = 'completed'), phase_id = ph
        where id = mrk[k];
      insert into task_dependencies (task_id, depends_on_id) values (mrk[k], nrm[marker_after[k]]);
    end loop;

    -- anything beyond the first 14: spread inside the window, no dependencies
    cnt := array_length(ids, 1);
    for k in 15..cnt loop
      off := -10 + ((k * 3) % 20);
      st := case when off + 4 < 0 then 'completed' when off <= 0 then 'in_progress' else 'not_started' end;
      update tasks set task_type = 'task', start_date = today + off, due_date = today + off + 4,
        status = st, completed = (st = 'completed')
        where id = ids[k];
    end loop;

    -- phases, milestones, sprints, deadline
    update phases set is_custom_mode = false,
      auto_start_date = today + case phase_number when 1 then -16 when 2 then -8 when 3 then 1 else 14 end,
      auto_end_date = today + case phase_number when 1 then -9 when 2 then 0 when 3 then 13 else 21 end
      where project_id = p.id;
    update milestones m set start_date = today - 10 + ((r.rn - 1) * 10)::int, end_date = today - 10 + ((r.rn - 1) * 10)::int
      from (select id, row_number() over (order by start_date, created_at, id) rn
            from milestones where project_id = p.id) r
      where m.id = r.id;
    update sprints sp set start_date = today - 14 + ((r.rn - 1) * 14)::int, end_date = today - 1 + ((r.rn - 1) * 14)::int
      from (select id, row_number() over (order by start_date, created_at, id) rn
            from sprints where project_id = p.id) r
      where sp.id = r.id;
    update projects set deadline = today + 21 where id = p.id;
  end loop;
end;
$$;

-- Bake in the new baseline (also records today as the anchor date).
select public.capture_demo_snapshot();

-- Verify afterward:
--   select p.name, t.title, t.task_type, t.status, t.start_date, t.due_date
--     from tasks t join projects p on p.id = t.project_id where p.is_demo order by p.name, t.start_date nulls last;
--   select count(*) from task_dependencies_demo_snapshot;
--   select public.restore_demo_projects(); -- dates stay put on the capture day
