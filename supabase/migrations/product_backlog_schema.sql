-- Product Backlog data model: extends the existing tasks table (no new
-- tasks-like table) with backlog-specific columns, plus a new sprints
-- table as the FK target for sprint_id - empty/unused until the Sprint
-- Board phase builds on it.
--
-- All new tasks columns are nullable and Waterfall projects never write to
-- them, so a Waterfall project's tasks are unaffected - the Backlog UI is
-- gated entirely client-side on project.methodology, same as the existing
-- methodology badge/filter.
--
-- `tasks` is one of the original tables and already has working anon +
-- authenticated access (see tasks_start_due_dates.sql / tasks_depends_on.sql),
-- so the ALTERs below need no policy changes. `sprints` is brand new and
-- needs its own policies - matching the fully-open posture every other
-- table currently has (see supabase/migrations/README.md and
-- phase1_access_control_schema.sql).
--
-- No milestones table exists anywhere in this schema (confirmed by
-- grepping the codebase - "milestone" only appears as a free-text field
-- label on team_newsletters), so epic_name is plain text, not a FK, as
-- anticipated.
--
-- description is also added here: the Backlog item form needs it (title,
-- description, story points, optional epic) and tasks has no description
-- column today - this wasn't in the original 5-column list, flagging it
-- explicitly since it's an addition beyond what was asked for.

create table if not exists sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  goal text,
  created_at timestamptz not null default now()
);

alter table sprints enable row level security;

drop policy if exists "anon full access" on sprints;
create policy "anon full access" on sprints
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "authenticated full access (temporary)" on sprints;
create policy "authenticated full access (temporary)" on sprints
  for all
  to authenticated
  using (true)
  with check (true);

alter table tasks add column if not exists description text;

alter table tasks add column if not exists story_points integer
  check (story_points is null or story_points in (1, 2, 3, 5, 8, 13));

alter table tasks add column if not exists backlog_rank integer;

alter table tasks add column if not exists backlog_status text
  check (backlog_status is null or backlog_status in ('backlog', 'ready', 'in_sprint', 'done'));

alter table tasks add column if not exists sprint_id uuid references sprints(id) on delete set null;

alter table tasks add column if not exists epic_name text;
