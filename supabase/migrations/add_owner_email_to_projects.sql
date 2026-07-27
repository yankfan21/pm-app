-- Adds projects.owner_email, denormalized the same way
-- project_collaborators.email already is (see phase1_access_control_schema.sql)
-- and for the same reason: this app has no profiles table readable by every
-- authenticated user (would let anyone enumerate every registered email), so
-- a collaborator viewing a project has no other RLS-safe way to learn the
-- owner's email/identity. Every viewer with SELECT access to a projects row
-- already has access to that project (RLS), so exposing the owner's email on
-- the row itself leaks nothing new.
--
-- Backfills existing rows from auth.users. New rows populate this at insert
-- time from the client (NewProjectFlow.jsx sets it alongside owner_id), same
-- pattern as project_collaborators.email - can go stale if the owner later
-- changes their email; acceptable, matching the existing collaborator-email
-- tradeoff.

alter table projects add column if not exists owner_email text;

update projects p
set owner_email = u.email
from auth.users u
where u.id = p.owner_id
  and p.owner_email is null;
