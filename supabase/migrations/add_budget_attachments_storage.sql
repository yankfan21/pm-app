-- Budget Tracker invoice/PO attachments: first Supabase Storage bucket in
-- this project. Private bucket, RLS-scoped to project membership the same
-- way every other table's RLS is (has_project_access / can_edit_project from
-- phase1_access_control_schema.sql).
--
-- Storage path convention: the bucket is 'budget-attachments'; an object's
-- path WITHIN that bucket is {project_id}/{attachment_id}.pdf (the bucket
-- name itself is not repeated in the path - storage.objects.name only holds
-- the in-bucket path). storage.foldername(name) splits that path into
-- folder components, so (storage.foldername(name))[1] recovers the
-- project_id a given object belongs to - that's what every policy below
-- checks against has_project_access/can_edit_project.

-- ── bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('budget-attachments', 'budget-attachments', false, 5242880, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── RLS on storage.objects, scoped to this bucket ───────────────────────
-- storage.objects already has RLS enabled by default in Supabase - no
-- `alter table ... enable row level security` needed/possible here (it's
-- a system table).

drop policy if exists "budget attachments: project members can view" on storage.objects;
create policy "budget attachments: project members can view"
on storage.objects for select
to authenticated
using (
  bucket_id = 'budget-attachments'
  and has_project_access((storage.foldername(name))[1]::uuid)
);

drop policy if exists "budget attachments: project editors can upload" on storage.objects;
create policy "budget attachments: project editors can upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'budget-attachments'
  and can_edit_project((storage.foldername(name))[1]::uuid)
);

drop policy if exists "budget attachments: project editors can update" on storage.objects;
create policy "budget attachments: project editors can update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'budget-attachments'
  and can_edit_project((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'budget-attachments'
  and can_edit_project((storage.foldername(name))[1]::uuid)
);

drop policy if exists "budget attachments: project editors can delete" on storage.objects;
create policy "budget attachments: project editors can delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'budget-attachments'
  and can_edit_project((storage.foldername(name))[1]::uuid)
);

-- ── budget_trackers.attachments ──────────────────────────────────────────
-- Each entry: { id, filename, storage_path, uploaded_at, size_bytes }.
-- storage_path is the in-bucket path (project_id/attachment_id.pdf) used to
-- mint signed URLs and to delete the object if an attachment is ever
-- removed outright (not just unlinked from one line item).

alter table budget_trackers add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── demo reset: attachments deliberately excluded from demo content ─────
-- Demo projects must never carry a real uploaded file forward. Rather than
-- leave budget_trackers_demo_snapshot without this column (which would trip
-- verify_demo_snapshot_schema()'s column-parity check the moment
-- budget_trackers gains it), the snapshot table gets the same column - but
-- capture_demo_snapshot() and restore_demo_projects() below hard-code it to
-- '[]' on both legs instead of copying whatever's actually there. So the
-- column exists (schema parity holds, the drift guard stays meaningful) but
-- real attachment data can never reach it.

alter table budget_trackers_demo_snapshot add column if not exists attachments jsonb not null default '[]'::jsonb;

create or replace function public.capture_demo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'capture_demo_snapshot: no rows in projects where is_demo = true';
  end if;

  truncate
    projects_demo_snapshot, milestones_demo_snapshot, sprints_demo_snapshot,
    phases_demo_snapshot, tasks_demo_snapshot, sprint_retros_demo_snapshot,
    charters_demo_snapshot, requirements_briefs_demo_snapshot, risk_logs_demo_snapshot,
    issue_logs_demo_snapshot, scopings_demo_snapshot,
    exec_comms_plans_demo_snapshot, team_newsletters_demo_snapshot,
    budget_trackers_demo_snapshot, status_updates_demo_snapshot,
    document_versions_demo_snapshot, post_mortems_demo_snapshot,
    project_evaluations_demo_snapshot;

  insert into projects_demo_snapshot select * from projects where id = any(demo_ids);
  insert into milestones_demo_snapshot select * from milestones where project_id = any(demo_ids);
  insert into sprints_demo_snapshot select * from sprints where project_id = any(demo_ids);
  insert into phases_demo_snapshot select * from phases where project_id = any(demo_ids);
  insert into tasks_demo_snapshot select * from tasks where project_id = any(demo_ids);

  insert into sprint_retros_demo_snapshot
    select sr.* from sprint_retros sr
    join sprints s on s.id = sr.sprint_id
    where s.project_id = any(demo_ids);

  insert into charters_demo_snapshot select * from charters where project_id = any(demo_ids);
  insert into requirements_briefs_demo_snapshot select * from requirements_briefs where project_id = any(demo_ids);
  insert into risk_logs_demo_snapshot select * from risk_logs where project_id = any(demo_ids);
  insert into issue_logs_demo_snapshot select * from issue_logs where project_id = any(demo_ids);
  insert into scopings_demo_snapshot select * from scopings where project_id = any(demo_ids);
  insert into exec_comms_plans_demo_snapshot select * from exec_comms_plans where project_id = any(demo_ids);
  insert into team_newsletters_demo_snapshot select * from team_newsletters where project_id = any(demo_ids);

  -- attachments hard-coded to '[]' - never copy real uploaded-file
  -- references into demo snapshot data (see comment block above).
  insert into budget_trackers_demo_snapshot (id, project_id, line_items, qa_answers, created_at, updated_at, attachments)
    select id, project_id, line_items, qa_answers, created_at, updated_at, '[]'::jsonb
    from budget_trackers where project_id = any(demo_ids);

  insert into status_updates_demo_snapshot select * from status_updates where project_id = any(demo_ids);
  insert into document_versions_demo_snapshot select * from document_versions where project_id = any(demo_ids);
  insert into post_mortems_demo_snapshot select * from post_mortems where project_id = any(demo_ids);
  insert into project_evaluations_demo_snapshot select * from project_evaluations where project_id = any(demo_ids);
end;
$$;

revoke all on function public.capture_demo_snapshot() from public, anon, authenticated;

create or replace function public.restore_demo_projects()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_ids uuid[];
begin
  perform public.verify_demo_snapshot_schema();

  select array_agg(id) into demo_ids from projects where is_demo = true;

  if demo_ids is null or array_length(demo_ids, 1) is null then
    raise exception 'restore_demo_projects: no rows in projects where is_demo = true - refusing to run';
  end if;

  if (select count(*) from projects_demo_snapshot where id = any(demo_ids)) <> array_length(demo_ids, 1) then
    raise exception 'restore_demo_projects: is_demo project set does not match projects_demo_snapshot - run capture_demo_snapshot() first';
  end if;

  -- delete: children before parents
  delete from sprint_retros where sprint_id in (select id from sprints where project_id = any(demo_ids));
  delete from tasks where project_id = any(demo_ids);
  delete from milestones where project_id = any(demo_ids);
  delete from sprints where project_id = any(demo_ids);
  delete from phases where project_id = any(demo_ids);
  delete from charters where project_id = any(demo_ids);
  delete from requirements_briefs where project_id = any(demo_ids);
  delete from risk_logs where project_id = any(demo_ids);
  delete from issue_logs where project_id = any(demo_ids);
  delete from scopings where project_id = any(demo_ids);
  delete from exec_comms_plans where project_id = any(demo_ids);
  delete from team_newsletters where project_id = any(demo_ids);
  delete from budget_trackers where project_id = any(demo_ids);
  delete from status_updates where project_id = any(demo_ids);
  delete from document_versions where project_id = any(demo_ids);
  delete from post_mortems where project_id = any(demo_ids);
  delete from project_evaluations where project_id = any(demo_ids);

  -- reinsert: parents before children
  insert into milestones select * from milestones_demo_snapshot;
  insert into sprints select * from sprints_demo_snapshot;

  insert into phases (
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  )
  select
    id, project_id, phase_number, phase_name,
    auto_start_date, auto_end_date, custom_start_date, custom_end_date,
    is_custom_mode, created_at
  from phases_demo_snapshot;

  insert into tasks select * from tasks_demo_snapshot;

  insert into sprint_retros select * from sprint_retros_demo_snapshot;
  insert into charters select * from charters_demo_snapshot;
  insert into requirements_briefs select * from requirements_briefs_demo_snapshot;
  insert into risk_logs select * from risk_logs_demo_snapshot;
  insert into issue_logs select * from issue_logs_demo_snapshot;
  insert into scopings select * from scopings_demo_snapshot;
  insert into exec_comms_plans select * from exec_comms_plans_demo_snapshot;
  insert into team_newsletters select * from team_newsletters_demo_snapshot;

  -- attachments hard-coded to '[]' on restore too - a demo project must
  -- come back from every nightly reset with zero attachments, regardless of
  -- what a visitor uploaded (and regardless of what's in the snapshot row,
  -- which is itself always '[]' per capture_demo_snapshot() above).
  insert into budget_trackers (id, project_id, line_items, qa_answers, created_at, updated_at, attachments)
    select id, project_id, line_items, qa_answers, created_at, updated_at, '[]'::jsonb
    from budget_trackers_demo_snapshot;

  insert into status_updates select * from status_updates_demo_snapshot;
  insert into document_versions select * from document_versions_demo_snapshot;
  insert into post_mortems select * from post_mortems_demo_snapshot;
  insert into project_evaluations select * from project_evaluations_demo_snapshot;

  update projects p
  set name = s.name,
      goal = s.goal,
      priority = s.priority,
      deadline = s.deadline,
      methodology = s.methodology,
      status = s.status,
      updated_at = s.updated_at
  from projects_demo_snapshot s
  where p.id = s.id;
end;
$$;

revoke all on function public.restore_demo_projects() from public, anon, authenticated;

-- Note: NOT calling capture_demo_snapshot() at the end of this file (every
-- prior add_*_to_demo_reset.sql migration does, to bake the new column into
-- the baseline) - deliberately, since attachments is hard-coded to '[]' in
-- both directions above and there's no real budget_trackers.attachments
-- data yet for a fresh capture to pick up anyway. Existing demo baselines
-- remain valid; verify_demo_snapshot_schema() will pass now that both
-- budget_trackers and budget_trackers_demo_snapshot have the column.

-- Verify afterward:
--
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'budget-attachments';
--
--   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'budget attachments:%';
--
--   select column_name from information_schema.columns where table_name = 'budget_trackers' and column_name = 'attachments';
--   select column_name from information_schema.columns where table_name = 'budget_trackers_demo_snapshot' and column_name = 'attachments';
--
--   select public.restore_demo_projects(); -- safe to test immediately
