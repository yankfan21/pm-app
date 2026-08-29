-- Risk Log overhaul: promotes individual risks out of risk_logs.risks
-- (a single jsonb array embedded on one parent row per project) into a real
-- `risks` table, one row per risk, plus a `risk_notes` activity-feed table
-- and a `risk_tasks` join table for task linking.
--
-- risk_logs itself is untouched and stays as the parent row (id, project_id,
-- qa_answers, created_at/updated_at) - risks.risk_log_id points back to it,
-- same "one parent doc row + real child rows" shape sprint_retros/tasks
-- already use elsewhere in this schema. risk_logs.risks (the old jsonb
-- array) is left in place but is now dead: no code path in this migration
-- or after it reads or writes that column. Confirmed with the user this is
-- deliberate, not a bug - existing projects show zero risks in the new
-- table until a PM manually recreates them (no backfill was wanted). A
-- future cleanup migration can drop risk_logs.risks once nobody needs to
-- glance at the old data.
--
-- ── task_id vs. risk_tasks reconciliation ───────────────────────────────
-- The original spec framed this as "one risk -> many tasks," but a scalar
-- task_id already exists and ships in production today (mobile's add-form
-- writes it into the old jsonb risk objects; desktop has silently never
-- read it - see riskScale.js/MobileProjectRisks.jsx). Carrying that forward
-- as risks.task_id keeps it the PRIMARY/original linked task with zero
-- compatibility shim needed. risk_tasks is strictly ADDITIONAL links beyond
-- that primary one - a risk with one linked task never needs a risk_tasks
-- row at all; the join table only gets used once a PM links a second (or
-- third...) task to the same risk. This mirrors tasks.depends_on (scalar,
-- still primary) vs. task_dependencies (join table, for anything beyond
-- the single-predecessor case) - see CLAUDE.md's existing follow-up note on
-- that exact pattern.
--
-- Not carried over: a cross-project guard on risks.task_id itself (unlike
-- risk_tasks below, which gets one). risks.task_id was already an
-- unguarded scalar FK in the old jsonb shape with no such check, and
-- extending guard logic to it wasn't asked for - flagging as a known gap,
-- not fixed here.

-- ── risks ────────────────────────────────────────────────────────────────

create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  risk_log_id uuid not null references risk_logs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  likelihood int check (likelihood is null or likelihood between 1 and 5),
  severity int check (severity is null or severity between 1 and 5),
  mitigation text,
  owner text,
  contingency_trigger text,
  contingency_plan text,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists risks_risk_log_id_idx on risks (risk_log_id);
create index if not exists risks_project_id_idx on risks (project_id);
create index if not exists risks_task_id_idx on risks (task_id) where task_id is not null;

-- Keeps project_id in sync with the parent risk_log's project_id, same
-- shape as task_comments_schema.sql's set_task_comment_project_id - callers
-- only ever need to supply risk_log_id on insert.
create or replace function public.set_risk_project_id()
returns trigger
language plpgsql
as $$
begin
  select project_id into new.project_id from risk_logs where id = new.risk_log_id;
  return new;
end;
$$;

drop trigger if exists risks_set_project_id on risks;
create trigger risks_set_project_id
  before insert on risks
  for each row
  execute function public.set_risk_project_id();

create or replace function public.set_risk_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists risks_set_updated_at on risks;
create trigger risks_set_updated_at
  before update on risks
  for each row
  execute function public.set_risk_updated_at();

alter table risks enable row level security;

-- Matches risk_logs' own current live policy shape exactly (see
-- phase4_full_lockdown_no_anon.sql): view = any project member, write =
-- owner/editor only. Individual risks inherit the parent doc's access
-- model rather than getting their own tier.
create policy "project members can view" on risks
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on risks
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on risks
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on risks
  for delete to authenticated using (can_edit_project(project_id));

-- ── risk_notes ───────────────────────────────────────────────────────────
-- Timestamped activity-feed entries on a risk - human PM notes and
-- assistant-drafted notes in the same append-only list, distinguished by
-- `source`. Structurally follows task_comments_schema.sql (the only
-- existing timestamped-entry-tied-to-a-parent-record pattern in this
-- schema) with two additions: author_id is nullable (assistant entries have
-- no auth.users row) and `source` replaces the implicit "always human"
-- assumption task_comments makes.

create table if not exists risk_notes (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references risks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('human', 'assistant')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  check ((source = 'assistant' and author_id is null) or (source = 'human' and author_id is not null))
);

create index if not exists risk_notes_risk_id_idx on risk_notes (risk_id);

create or replace function public.set_risk_note_project_id()
returns trigger
language plpgsql
as $$
begin
  select project_id into new.project_id from risks where id = new.risk_id;
  return new;
end;
$$;

drop trigger if exists risk_notes_set_project_id on risk_notes;
create trigger risk_notes_set_project_id
  before insert on risk_notes
  for each row
  execute function public.set_risk_note_project_id();

alter table risk_notes enable row level security;

-- Insert is has_project_access (any member), not can_edit_project - same
-- reasoning task_comments_schema.sql gives: leaving a note isn't "edit the
-- plan," a viewer should be able to add one same as an editor. with_check
-- pins source='human' and author_id=auth.uid() so nobody can post under
-- someone else's identity or fake an assistant-sourced row through the
-- authenticated role - assistant inserts only ever happen via the risk-log
-- Edge Function's service-role client (see logUsage's serviceClient in
-- supabase/functions/risk-log/index.ts), which bypasses RLS entirely, same
-- as ai_usage_log.
create policy "project members can view" on risk_notes
  for select to authenticated using (has_project_access(project_id));
create policy "project members can add notes" on risk_notes
  for insert to authenticated
  with check (has_project_access(project_id) and source = 'human' and author_id = auth.uid());
create policy "author can update own note" on risk_notes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "author can delete own note" on risk_notes
  for delete to authenticated using (author_id = auth.uid());

-- ── risk_tasks ───────────────────────────────────────────────────────────
-- Additional risk<->task links beyond the primary risks.task_id (see
-- reconciliation note at top of file). Structurally identical to
-- task_dependencies_schema.sql: composite PK, no own project_id column
-- (resolved via subquery to the owning risk), a BEFORE trigger that
-- silently drops cross-project pairs instead of rejecting the whole
-- statement, and an AFTER trigger that cleans up stale rows if a task
-- moves to a different project.

create table if not exists risk_tasks (
  risk_id uuid not null references risks(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (risk_id, task_id)
);

alter table risk_tasks enable row level security;

create policy "project members can view" on risk_tasks
  for select to authenticated
  using (has_project_access((select r.project_id from risks r where r.id = risk_tasks.risk_id)));
create policy "project editors can insert" on risk_tasks
  for insert to authenticated
  with check (can_edit_project((select r.project_id from risks r where r.id = risk_tasks.risk_id)));
create policy "project editors can delete" on risk_tasks
  for delete to authenticated
  using (can_edit_project((select r.project_id from risks r where r.id = risk_tasks.risk_id)));

create or replace function public.enforce_risk_task_project_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  risk_project uuid;
  task_project uuid;
begin
  select project_id into risk_project from risks where id = new.risk_id;
  select project_id into task_project from tasks where id = new.task_id;

  if risk_project is distinct from task_project then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_risk_task_project_consistency on risk_tasks;
create trigger enforce_risk_task_project_consistency
  before insert or update on risk_tasks
  for each row
  execute function public.enforce_risk_task_project_consistency();

create or replace function public.cleanup_stale_risk_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from risk_tasks rt
  where rt.task_id = new.id
    and exists (
      select 1 from risks r
      where r.id = rt.risk_id
        and r.project_id is distinct from new.project_id
    );
  return null; -- AFTER trigger - return value is ignored either way
end;
$$;

drop trigger if exists cleanup_stale_risk_tasks on tasks;
create trigger cleanup_stale_risk_tasks
  after update of project_id on tasks
  for each row
  execute function public.cleanup_stale_risk_tasks();

-- ── Verification - run after the block above ────────────────────────────
--
-- 1. Confirm all three tables exist with RLS enabled:
--   select relname, relrowsecurity from pg_class
--   where relname in ('risks', 'risk_notes', 'risk_tasks');
--
-- 2. Confirm policy counts (expect risks=4, risk_notes=4, risk_tasks=3):
--   select tablename, count(*) from pg_policies
--   where tablename in ('risks', 'risk_notes', 'risk_tasks') group by tablename;
--
-- 3. Confirm triggers landed (expect 6 rows, all tgenabled = 'O'):
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--   where tgname in ('risks_set_project_id', 'risks_set_updated_at',
--     'risk_notes_set_project_id', 'enforce_risk_task_project_consistency',
--     'cleanup_stale_risk_tasks');
