-- Fixes a 500 on Apple sign-in: Apple omits email on every sign-in after
-- the first authorization (privacy behavior, not an error case). The
-- on_auth_user_created_grant_demo_access trigger (demo_projects_auto_access.sql)
-- fires on every new auth.users row and inserts new.email into
-- project_collaborators, which currently requires email not null - so any
-- signup with a null email fails the whole insert.
--
-- email on this table is a denormalized, display-only convenience column
-- (see phase1_access_control_schema.sql) - user_id is the real key used by
-- has_project_access/can_edit_project and the unique (project_id, user_id)
-- index the trigger's ON CONFLICT relies on. Dropping NOT NULL here doesn't
-- change how access is resolved anywhere.

alter table project_collaborators alter column email drop not null;
