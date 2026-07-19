-- Run this in the Supabase SQL editor (use "Run", not "run current
-- statement") to add assignee support to tasks, powering the new Gantt
-- "Assignee" filter and the assignee UI in the task form / TaskGenFlow /
-- TaskImportFlow.
--
-- Two nullable columns, mutually exclusive:
--   - assignee_user_id: a real project collaborator (references
--     auth.users(id) directly, same pattern as projects.owner_id and
--     project_collaborators.user_id in phase1_access_control_schema.sql -
--     not a FK to project_collaborators itself, so the assignment survives
--     a collaborator being removed and re-invited later, since the user_id
--     stays the same across invites). `on delete set null` so a deleted
--     auth user doesn't take their assigned tasks down with them.
--   - assignee_name: a one-off/free-text assignee (e.g. a contractor who
--     isn't a project collaborator and never will be).
--
-- Both null means unassigned - that's the default state for every existing
-- row, so this migration changes no existing task's behavior. The check
-- constraint below only rules out having both set at once; resolving the
-- display name (join assignee_user_id against project_collaborators.email
-- for that project, since auth.users isn't broadly readable - see
-- phase1_access_control_schema.sql - or just show assignee_name directly)
-- is frontend work, not enforced here.

alter table tasks add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

alter table tasks add column if not exists assignee_name text;

alter table tasks drop constraint if exists tasks_assignee_single_check;
alter table tasks add constraint tasks_assignee_single_check
  check (assignee_user_id is null or assignee_name is null);
