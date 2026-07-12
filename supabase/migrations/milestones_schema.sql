-- Formalizes Milestones as a real entity for Waterfall/Hybrid projects.
-- Previously there was no milestones table anywhere in this schema -
-- "milestones" were just an informal grouping of clustered tasks on the
-- Gantt chart, and a Hybrid backlog item's "Epic" was plain free text
-- (tasks.epic_name, added in product_backlog_schema.sql).
--
-- milestones gets the same open RLS posture as every other table right
-- now (anon + authenticated full access) - NOT the locked-down
-- owner/editor/viewer policies phase4_lockdown_rls.sql defines for other
-- tables, because that migration has been written but deliberately not
-- run yet (projects/tasks/etc. are still open to anon - confirmed via
-- pg_policies on 2026-07-09). If phase4 ever actually runs, milestones
-- should get the same per-project policy shape as tasks at that time.
--
-- tasks.milestone_id is one nullable FK column serving two purposes:
--   - Waterfall/Hybrid tasks can optionally be tagged with a milestone,
--     additively - nothing about start_date/due_date/depends_on or how
--     GanttChart.jsx/ganttLayout.js compute bars changes.
--   - A Hybrid backlog item's "Epic" becomes a milestone reference
--     instead of free text.
--
-- epic_name is kept, not dropped or backfilled. 79 existing backlog rows
-- across 4 Hybrid projects already have epic_name set (see query at the
-- bottom), and none of it can be safely auto-matched to a new milestone
-- row: labels are inconsistent even within a single project (e.g.
-- project 46fb50a1 has both "M1: Foundation & Core Loop" and a lone "M1"
-- on one row), so a fuzzy match would silently mis-link data. Leaving
-- epic_name alone means existing items keep showing their old text label
-- (BacklogView.jsx falls back to it when milestone_id is null) until
-- someone manually re-maps them to a real milestone; nothing is lost or
-- guessed at.

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  description text,
  created_at timestamptz not null default now()
);

alter table milestones enable row level security;

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

alter table tasks add column if not exists milestone_id uuid references milestones(id) on delete set null;

-- Run this afterward to see every existing backlog item with a populated
-- epic_name, grouped by project, so they can be manually re-mapped to
-- real milestones once some exist for that project:
--
--   select project_id, epic_name, count(*)
--   from tasks
--   where epic_name is not null
--   group by project_id, epic_name
--   order by project_id, epic_name;
