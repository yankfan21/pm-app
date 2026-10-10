-- Second pass on the demo Gantt data (follows demo_dynamic_dates_and_gantt_showcase.sql).
--
-- The first pass dated tasks by row order, so task names and dates disagreed
-- (e.g. "Deploy ... (go-live)" completed weeks before the "Go live" marker)
-- and only 14 tasks per project had dependencies. This pass schedules EVERY
-- task of the waterfall and hybrid demo projects by what it actually is:
-- hand-written dates, statuses and dependency graph (parallel streams, tasks
-- with several predecessors, a delayed task, three milestone markers), and
-- renames the junk-titled rows ("Task A", "TEST 3", "MILESTONE", ...).
-- Dates are offsets from today; capture_demo_snapshot() at the end records
-- today as the anchor, so the nightly reset keeps sliding them forward.
--
-- Scope: only projects with is_demo = true and methodology waterfall/hybrid.
-- Nothing is deleted except those projects' task_dependencies rows (rebuilt
-- below). Aborts without changing anything if a demo task has no matching
-- row in the schedule. Safe to re-run (matches old or new title).

create temp table demo_sched (
  methodology text, key text, title text, new_title text,
  s int, e int, status text, preds text[]
);

insert into demo_sched values
    ('waterfall', 'T1', 'Map current support ticket flow and identify pain points', null, -15, -12, 'completed', array[]::text[]),
    ('waterfall', 'T2', 'Gather and document detailed portal requirements from stakeholders', null, -11, -7, 'completed', array['T1']::text[]),
    ('waterfall', 'T3', 'Task A', 'Define success metrics for ticket reduction', -11, -8, 'completed', array['T1']::text[]),
    ('waterfall', 'T4', 'Task D', 'Document accessibility and security requirements', -6, -3, 'completed', array['T2']::text[]),
    ('waterfall', 'T17', 'Create risk register and schedule contingency/buffer plan for sequential phase delays', null, -6, -3, 'completed', array['T2']::text[]),
    ('waterfall', 'T21', 'Draft vendor contract terms', null, -6, -4, 'completed', array['T2']::text[]),
    ('waterfall', 'T8', 'Establish change-control process and scope-change log for post-signoff requests', null, -6, -3, 'completed', array['T2']::text[]),
    ('waterfall', 'T6', 'TEST 3', 'Review risks with project sponsor', -2, -1, 'completed', array['T17']::text[]),
    ('waterfall', 'T9', 'Define phase-gate exit criteria and sign-off checklist for each waterfall phase', null, -6, -1, 'delayed', array['T2']::text[]),
    ('waterfall', 'T16', 'Create wireframes and UX design for redesigned portal', null, -2, 3, 'in_progress', array['T4','T3']::text[]),
    ('waterfall', 'T5', 'Develop deployment and rollout plan', null, -2, 2, 'in_progress', array['T8']::text[]),
    ('waterfall', 'T18', 'Set up staging environment', null, -2, 3, 'in_progress', array['T8']::text[]),
    ('waterfall', 'T24', 'Set up recurring risk and schedule review cadence with sponsor and stakeholders', null, -1, 1, 'in_progress', array['T17']::text[]),
    ('waterfall', 'T13', 'TEST QUARTERS', 'Prepare QA test cases and test data', -2, 4, 'in_progress', array['T4']::text[]),
    ('waterfall', 'T14', 'Build/update backend APIs for ticket resolution flow', null, -2, 7, 'in_progress', array['T4']::text[]),
    ('waterfall', 'T31', 'Conduct design review and obtain stakeholder sign-off', null, 4, 5, 'not_started', array['T16','T9']::text[]),
    ('waterfall', 'T26', 'Review localization strings', null, 4, 7, 'not_started', array['T16']::text[]),
    ('waterfall', 'T11', 'Build redesigned portal front-end', null, 6, 11, 'not_started', array['T31']::text[]),
    ('waterfall', 'T22', 'Task C', 'Configure analytics and ticket tracking dashboards', 4, 8, 'not_started', array['T18']::text[]),
    ('waterfall', 'T30', 'Recruit and onboard pilot test group', null, 3, 12, 'not_started', array['T5']::text[]),
    ('waterfall', 'T27', 'Prepare and configure production environment/infrastructure', null, 4, 15, 'not_started', array['T18']::text[]),
    ('waterfall', 'T23', 'Integrate front-end with backend using real data', null, 12, 14, 'not_started', array['T11','T14']::text[]),
    ('waterfall', 'T12', 'Conduct end-to-end functional and QA testing', null, 15, 17, 'not_started', array['T23','T13']::text[]),
    ('waterfall', 'T19', 'Conduct training sessions for Customer Support Team', null, 12, 17, 'not_started', array['T11']::text[]),
    ('waterfall', 'T20', 'Fix bugs and issues identified during QA testing', null, 18, 20, 'not_started', array['T12']::text[]),
    ('waterfall', 'T25', 'Run pilot test and collect feedback for sign-off', null, 21, 24, 'not_started', array['T20','T30']::text[]),
    ('waterfall', 'T10', 'Communicate rollout schedule and changes to end customers', null, 18, 21, 'not_started', array['T5']::text[]),
    ('waterfall', 'T29', 'Finalize rollout checklist', null, 25, 26, 'not_started', array['T25','T27']::text[]),
    ('waterfall', 'T7', 'Deploy redesigned portal to production (go-live)', null, 27, 28, 'not_started', array['T29','T19','T10']::text[]),
    ('waterfall', 'T15', 'Monitor post-launch performance and ticket resolution metrics', null, 30, 35, 'not_started', array['T7']::text[]),
    ('waterfall', 'T28', 'Conduct post-launch review and document lessons learned', null, 36, 38, 'not_started', array['T15']::text[]),
    ('waterfall', 'M1', 'Design approved', 'Requirements signed off', null::int, -3, 'completed', array['T2','T3']::text[]),
    ('waterfall', 'M2', 'UAT starts', null, null::int, 21, 'not_started', array['T20']::text[]),
    ('waterfall', 'M3', 'Go live', null, null::int, 29, 'not_started', array['T7']::text[]),
    ('hybrid', 'H1', 'Select and confirm three target regions for rollout', null, -15, -12, 'completed', array[]::text[]),
    ('hybrid', 'H17', 'Establish 2-week iterative sprint cadence for feature refinement', null, -15, -13, 'completed', array[]::text[]),
    ('hybrid', 'H2', 'Define shared fixed-phase rollout plan and milestones', null, -11, -8, 'completed', array['H1']::text[]),
    ('hybrid', 'H3', 'Assess localization requirements for each selected region', null, -11, -7, 'completed', array['H1']::text[]),
    ('hybrid', 'H13', 'Run first two-week iterative feature-delivery sprint for regional launch readiness', null, -12, -1, 'completed', array['H17']::text[]),
    ('hybrid', 'H8', 'Define fixed-phase rollout milestone plan', 'Agree phase-gate criteria with regional leads', -7, -4, 'completed', array['H2']::text[]),
    ('hybrid', 'H5', 'Configure deployment pipeline on existing web/mobile stack for parallel regional rollout', null, -7, -3, 'completed', array['H2']::text[]),
    ('hybrid', 'H15', 'Establish coordination checkpoints between fixed-phase and iterative cycles', null, -3, -2, 'completed', array['H8']::text[]),
    ('hybrid', 'H4', 'Launch internal pilot release across three regions', null, -2, -1, 'completed', array['H5','H3']::text[]),
    ('hybrid', 'H16', 'Hold coordination checkpoint reviewing fixed-phase milestones vs iterative cycle progress', null, -1, -1, 'delayed', array['H15']::text[]),
    ('hybrid', 'H12', 'Run second two-week iterative feature-delivery sprint incorporating pilot prep', null, 0, 13, 'in_progress', array['H13']::text[]),
    ('hybrid', 'H6', 'Collect and triage pilot feedback for go/no-go decision', null, 0, 3, 'in_progress', array['H4']::text[]),
    ('hybrid', 'H7', 'Build localization adaptations for all three regions', null, -6, 7, 'in_progress', array['H3']::text[]),
    ('hybrid', 'H11', 'Build progress and effort tracking mechanism', null, -3, 3, 'in_progress', array['H8']::text[]),
    ('hybrid', 'H10', 'Complete infrastructure/deployment readiness checklist per region', null, -2, 5, 'in_progress', array['H5']::text[]),
    ('hybrid', 'H18', 'Collect and triage internal pilot feedback', 'Triage second-round pilot feedback', 4, 7, 'not_started', array['H6']::text[]),
    ('hybrid', 'H9', 'Execute wider regional release rollout', 'Roll out to first-wave regions', 8, 12, 'not_started', array['H6','H10']::text[]),
    ('hybrid', 'H14', 'Localize product content and settings for each region', null, 8, 12, 'not_started', array['H7']::text[]),
    ('hybrid', 'H21', 'MILESTONE', 'Regional leads readiness sign-off', 13, 14, 'not_started', array['H9','H14']::text[]),
    ('hybrid', 'H19', 'Run iterative feature refinement sprints for launch readiness', null, 14, 20, 'not_started', array['H12','H18']::text[]),
    ('hybrid', 'H20', 'Execute wider regional release across all three regions', 'Roll out to remaining regions', 21, 26, 'not_started', array['H19','H21']::text[]),
    ('hybrid', 'HM1', 'Design approved', 'Regions and plan approved', null::int, -3, 'completed', array['H8','H3']::text[]),
    ('hybrid', 'HM2', 'UAT starts', 'Pilot go/no-go', null::int, 4, 'not_started', array['H6']::text[]),
    ('hybrid', 'HM3', 'Go live', 'Full regional launch', null::int, 27, 'not_started', array['H20']::text[]);

do $$
declare
  today date := current_date;
  missing text;
  dups int;
begin
  -- 1. every task of the demo projects must be covered, exactly once
  select string_agg(p.name || ': ' || t.title, '; ') into missing
  from tasks t
  join projects p on p.id = t.project_id
  where p.is_demo = true and lower(p.methodology) in ('waterfall', 'hybrid')
    and not exists (
      select 1 from demo_sched d
      where d.methodology = lower(p.methodology) and t.title in (d.title, d.new_title));
  if missing is not null then
    raise exception 'demo tasks without a schedule row (nothing changed): %', missing;
  end if;

  select count(*) into dups from (
    select t.id from tasks t
    join projects p on p.id = t.project_id
    join demo_sched d on d.methodology = lower(p.methodology) and t.title in (d.title, d.new_title)
    where p.is_demo = true
    group by t.id having count(*) > 1) x;
  if dups > 0 then
    raise exception 'some demo tasks match more than one schedule row (nothing changed)';
  end if;

  -- 2. phase windows (offsets from today) per project type
  update phases ph set is_custom_mode = false,
    auto_start_date = today + case when p.methodology ilike 'waterfall' then
        case ph.phase_number when 1 then -16 when 2 then -7 when 3 then 5 else 20 end
      else case ph.phase_number when 1 then -16 when 2 then -6 when 3 then 4 else 21 end end,
    auto_end_date = today + case when p.methodology ilike 'waterfall' then
        case ph.phase_number when 1 then -8 when 2 then 4 when 3 then 19 else 38 end
      else case ph.phase_number when 1 then -7 when 2 then 3 when 3 then 20 else 27 end end
  from projects p
  where p.id = ph.project_id and p.is_demo = true and lower(p.methodology) in ('waterfall', 'hybrid');

  -- 3. tasks: titles, dates, status, type, phase
  update tasks t set
    title = coalesce(d.new_title, d.title),
    task_type = case when d.s is null then 'milestone_marker' else 'task' end,
    start_date = case when d.s is null then null else today + d.s end,
    due_date = today + d.e,
    status = d.status,
    completed = (d.status = 'completed'),
    phase_id = (
      select ph.id from phases ph
      where ph.project_id = t.project_id
        and ph.phase_number = case
          when p.methodology ilike 'waterfall' then
            case when coalesce(d.s, d.e) <= -8 then 1 when coalesce(d.s, d.e) <= 4 then 2
                 when coalesce(d.s, d.e) <= 19 then 3 else 4 end
          else
            case when coalesce(d.s, d.e) <= -7 then 1 when coalesce(d.s, d.e) <= 3 then 2
                 when coalesce(d.s, d.e) <= 20 then 3 else 4 end end)
  from projects p, demo_sched d
  where p.id = t.project_id and p.is_demo = true
    and d.methodology = lower(p.methodology) and t.title in (d.title, d.new_title);

  -- 4. dependencies: rebuilt for these projects only
  delete from task_dependencies where task_id in (
    select t.id from tasks t join projects p on p.id = t.project_id
    where p.is_demo = true and lower(p.methodology) in ('waterfall', 'hybrid'));
  update tasks set depends_on = null where project_id in (
    select id from projects where is_demo = true and lower(methodology) in ('waterfall', 'hybrid'));

  insert into task_dependencies (task_id, depends_on_id)
  select tt.id, pt.id
  from demo_sched d
  cross join lateral unnest(d.preds) as pk(key)
  join demo_sched pd on pd.methodology = d.methodology and pd.key = pk.key
  join projects p on p.is_demo = true and lower(p.methodology) = d.methodology
  join tasks tt on tt.project_id = p.id and tt.title = coalesce(d.new_title, d.title)
  join tasks pt on pt.project_id = p.id and pt.title = coalesce(pd.new_title, pd.title);

  -- 5. project deadlines
  update projects set deadline = today + case when lower(methodology) = 'waterfall' then 40 else 30 end
  where is_demo = true and lower(methodology) in ('waterfall', 'hybrid');
end;
$$;

drop table demo_sched;

-- Bake in the new baseline (also records today as the anchor date).
select public.capture_demo_snapshot();

-- Verify afterward:
--   select p.name, count(*) tasks, count(*) filter (where t.task_type = 'milestone_marker') markers,
--          count(distinct t.status) statuses
--     from tasks t join projects p on p.id = t.project_id where p.is_demo group by p.name;
--   select count(*) from task_dependencies_demo_snapshot;
