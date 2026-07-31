-- Deletes 10 leftover demo/test projects, confirmed by Scott as old data,
-- not real - investigated in prior sessions (FK/cascade audit, row counts,
-- status/is_demo check via `supabase db query --linked`, all confirmed
-- status = 'Active', is_demo = false, i.e. not caught by either reminder
-- exclusion migration).
--
-- Explicit ids used throughout, not name matching - avoids any ambiguity
-- if a project were ever renamed.
--
--   Bandito                    c2afc439-3afc-4bb9-ab03-892476e06e46
--   Customer Onboarding        ce179344-55b6-434c-aaeb-d6738fdac5ff
--   Data Migration             a002a43a-851c-424f-9aa2-9484072c1b39
--   Employee Handbook Update   1c6e5f8d-bf0a-4958-aea7-98d8dd4c2e5a
--   Mobile App Launch          15ce380f-a669-4b1f-8a51-3c5efacc534c
--   Q3 Marketing Campaign      e9656e6e-5619-434b-b486-88bdfeb50604
--   Vendor Contract Renewal    9a55c79c-266b-42b5-a12f-e68f8f3c6bb2
--   Website Redesign           733a667e-38a2-4565-babc-0ff677cb2eba
--   TEST Anon Incognito        b256737d-6451-4246-8254-bfbbd3e08ac3
--   TEST Ownership             b9ed08e4-080a-43dd-aa6b-23982fc6207c
--
-- Step 1 deletes task_reminder_queue rows first - that table has no FK to
-- projects (create_task_reminder_queue.sql: project_id uuid not null, no
-- references clause), so it won't be touched by the cascade in step 2 and
-- would otherwise be left pointing at a deleted project_id.
--
-- Step 2 deletes the projects rows themselves. Every other dependent table
-- (tasks, charters, requirements_briefs, risk_logs, exec_comms_plans,
-- team_newsletters, budget_trackers, status_updates, project_evaluations,
-- project_collaborators, milestones, sprints, phases, document_versions,
-- post_mortems, issue_logs) has `on delete cascade` on its project_id FK
-- (confirmed live via information_schema.referential_constraints), so
-- those rows are removed automatically - no explicit DELETE needed for
-- them here.

delete from task_reminder_queue
where project_id in (
  'c2afc439-3afc-4bb9-ab03-892476e06e46',
  'ce179344-55b6-434c-aaeb-d6738fdac5ff',
  'a002a43a-851c-424f-9aa2-9484072c1b39',
  '1c6e5f8d-bf0a-4958-aea7-98d8dd4c2e5a',
  '15ce380f-a669-4b1f-8a51-3c5efacc534c',
  'e9656e6e-5619-434b-b486-88bdfeb50604',
  '9a55c79c-266b-42b5-a12f-e68f8f3c6bb2',
  '733a667e-38a2-4565-babc-0ff677cb2eba',
  'b256737d-6451-4246-8254-bfbbd3e08ac3',
  'b9ed08e4-080a-43dd-aa6b-23982fc6207c'
);

delete from projects
where id in (
  'c2afc439-3afc-4bb9-ab03-892476e06e46',
  'ce179344-55b6-434c-aaeb-d6738fdac5ff',
  'a002a43a-851c-424f-9aa2-9484072c1b39',
  '1c6e5f8d-bf0a-4958-aea7-98d8dd4c2e5a',
  '15ce380f-a669-4b1f-8a51-3c5efacc534c',
  'e9656e6e-5619-434b-b486-88bdfeb50604',
  '9a55c79c-266b-42b5-a12f-e68f8f3c6bb2',
  '733a667e-38a2-4565-babc-0ff677cb2eba',
  'b256737d-6451-4246-8254-bfbbd3e08ac3',
  'b9ed08e4-080a-43dd-aa6b-23982fc6207c'
);

-- Verify: expect 0.
select count(*) as remaining_rows
from projects
where id in (
  'c2afc439-3afc-4bb9-ab03-892476e06e46',
  'ce179344-55b6-434c-aaeb-d6738fdac5ff',
  'a002a43a-851c-424f-9aa2-9484072c1b39',
  '1c6e5f8d-bf0a-4958-aea7-98d8dd4c2e5a',
  '15ce380f-a669-4b1f-8a51-3c5efacc534c',
  'e9656e6e-5619-434b-b486-88bdfeb50604',
  '9a55c79c-266b-42b5-a12f-e68f8f3c6bb2',
  '733a667e-38a2-4565-babc-0ff677cb2eba',
  'b256737d-6451-4246-8254-bfbbd3e08ac3',
  'b9ed08e4-080a-43dd-aa6b-23982fc6207c'
);
