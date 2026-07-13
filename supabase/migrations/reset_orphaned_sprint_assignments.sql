-- Follow-up to fix_wms_backlog_project_id.sql: 10 of the 58 backlog rows
-- moved from TEST UPLOAD to WMS Tower App still carry sprint_id pointing
-- at c6c8ae05-cbe1-48ef-b6bd-22aabd411128 - TEST UPLOAD's only sprint
-- ("M1", 2026-07-13 to 2026-07-17), which does not exist under WMS Tower
-- App (its 12 real sprints are separate rows/UUIDs, "Sprint 1".."Sprint
-- 12"). Confirmed via direct query on 2026-07-13: none of the 10 are
-- in_progress or done (board_status is 'todo' on all of them), and 6 of
-- the 10 have backlog_status = 'backlog' while sprint_id is set - a
-- combination the app's own code never produces (assignTaskToSprint in
-- src/sprintAssignment.js always pairs sprint_id with backlog_status =
-- 'in_sprint'), so there's no reliable prior state to preserve or map
-- from.
--
-- Rather than guess which of the 12 real sprints these belong to, this
-- resets all 10 to the same clean "unassigned" state the app's own
-- "unassign from sprint" action produces (see the sprint_id: null,
-- board_status: null, backlog_status: 'ready' update in
-- src/SprintBoardView.jsx). Scott will re-assign each one to the correct
-- real sprint manually through the UI afterward.

-- 1. Verify scope before updating (expect exactly 10 rows):
select id, title, epic_name, backlog_status, board_status, sprint_id
from tasks
where project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
  and sprint_id = 'c6c8ae05-cbe1-48ef-b6bd-22aabd411128';

-- 2. Reset to the app's standard "unassigned" state:
update tasks
set sprint_id = null,
    board_status = null,
    backlog_status = 'ready'
where project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
  and sprint_id = 'c6c8ae05-cbe1-48ef-b6bd-22aabd411128';

-- 3. Confirm: expect 0 rows left pointing at the stale sprint...
select count(*) from tasks
where project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
  and sprint_id = 'c6c8ae05-cbe1-48ef-b6bd-22aabd411128';

-- ...and 10 rows now sitting in a clean 'ready' / unassigned state:
select count(*) from tasks
where project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
  and backlog_status = 'ready'
  and sprint_id is null
  and board_status is null;
