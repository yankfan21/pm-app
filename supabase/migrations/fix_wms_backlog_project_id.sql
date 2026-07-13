-- Fixes a data-placement mistake: 58 backlog rows for "WMS Tower App"
-- (project 46fb50a1-916b-4a20-9a15-5a15c952a750) were left behind on a
-- scratch project called "TEST UPLOAD" (c335768a-b560-4fa4-80d6-7d655a37a644)
-- instead of the real project - almost certainly from testing the Excel
-- import flow against the wrong project. Confirmed via direct query on
-- 2026-07-13: TEST UPLOAD holds exactly 58 rows with backlog_status set
-- (epics M1-M6), while the real WMS Tower App has 0. The real project's
-- 29 Gantt/milestone tasks (backlog_status is null, already linked via
-- milestone_id) are untouched - this only moves backlog rows.
--
-- Run the verification SELECT first to confirm you're still looking at
-- the same 58 rows before running the UPDATE.

-- 1. Verify scope before updating (expect 58 rows, all epic_name in M1..M6):
select id, title, epic_name, backlog_status, backlog_rank
from tasks
where project_id = 'c335768a-b560-4fa4-80d6-7d655a37a644'
  and backlog_status is not null
order by epic_name, backlog_rank;

-- 2. Move them to the real WMS Tower App project:
update tasks
set project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
where project_id = 'c335768a-b560-4fa4-80d6-7d655a37a644'
  and backlog_status is not null;

-- 3. Confirm the move: expect 58 here now...
select count(*) from tasks
where project_id = '46fb50a1-916b-4a20-9a15-5a15c952a750'
  and backlog_status is not null;

-- ...and 0 remaining under TEST UPLOAD (its 28 duplicate Gantt tasks,
-- backlog_status null, should still be there untouched):
select count(*) filter (where backlog_status is not null) as backlog_remaining,
       count(*) filter (where backlog_status is null) as non_backlog_remaining
from tasks
where project_id = 'c335768a-b560-4fa4-80d6-7d655a37a644';
