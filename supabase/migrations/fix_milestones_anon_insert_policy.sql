-- Fixes: "Generate Milestones from Charter" fails on insert with
-- "new row violates row-level security policy for table 'milestones'"
-- for WMS Tower App (and presumably any other project).
--
-- Diagnosis (2026-07-13): anon SELECT on milestones works fine, but anon
-- INSERT is rejected by RLS - the signature of a missing/broken INSERT
-- policy rather than a stricter auth.uid()/auth.role() check (the
-- original migration never wrote one of those for this table). tasks and
-- sprints both currently have a working, equivalent "for all ... using
-- (true) with check (true)" open policy; milestones was supposed to get
-- the identical shape in milestones_schema.sql but it appears to be
-- missing or broken on the live database - either it never actually got
-- created when that migration ran, or it was altered/dropped afterward
-- by something not tracked in this repo's migrations. Not confirmed via
-- direct pg_policies inspection (anon REST API doesn't expose
-- information_schema/pg_catalog), so this is inferred from behavior, not
-- read off the live policy row.
--
-- These are the exact same two statements from milestones_schema.sql,
-- copied verbatim - both idempotent (drop-if-exists then create), so
-- re-running them is safe no matter what the current actual state is.
-- This does not change milestones' RLS posture beyond what
-- milestones_schema.sql already intended (open to anon + authenticated,
-- matching tasks/sprints - see the comment at the top of that file for
-- why: phase4_lockdown_rls.sql exists but has deliberately not been run
-- yet, so every project-scoped table is still open to anon).

drop policy if exists "anon full access" on milestones;
create policy "anon full access" on milestones
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "authenticated full access (temporary)" on milestones;
create policy "authenticated full access (temporary)" on milestones
  for all
  to authenticated
  using (true)
  with check (true);

-- Verify afterward: confirm both policies exist on milestones and match
-- the same shape as tasks/sprints (roles, cmd = ALL, permissive):
--
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'milestones';
