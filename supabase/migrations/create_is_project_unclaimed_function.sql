-- Prerequisite for anon_write_unclaimed_tasks_charters.sql (and for the
-- tasks/charters "project members can view" policies already live from an
-- earlier pass, which also reference this function).
--
-- Confirmed 2026-07-13: this function does not exist live yet - the full
-- phase4_lockdown_rls.sql run stopped on a "policy already exists"
-- collision on the projects table before ever reaching this definition,
-- even though it's written earlier in that file. Run this first, then
-- anon_write_unclaimed_tasks_charters.sql.
--
-- Pulled verbatim from phase4_lockdown_rls.sql (lines 57-69) - matches
-- exactly, nothing added or changed.

create or replace function public.is_project_unclaimed(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects where id = p_project_id and owner_id is null
  );
$$;

grant execute on function public.is_project_unclaimed(uuid) to authenticated;
