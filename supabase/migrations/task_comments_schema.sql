-- Task Comments: net-new table and feature - no comments table existed
-- anywhere in this schema before this migration (confirmed by grepping the
-- whole codebase and every prior migration during Phase 2 Chunk 1
-- investigation). Built for phone mode's task detail screen
-- (/m/projects/:projectId/tasks/:taskId) but not desktop-specific - any
-- future desktop consumer can read/write the same table.
--
-- project_id is denormalized onto the row (not resolved via a join back to
-- tasks on every RLS check) even though it's derivable from task_id -
-- matches the has_project_access(project_id)/can_edit_project(project_id)
-- helper signature every other table's policy already uses (see
-- phase1_access_control_schema.sql), and keeps this table's policies a
-- plain column check instead of a subquery through tasks. Enforced to stay
-- in sync with tasks.project_id via the trigger below, so it can never
-- drift even though nothing in the app should ever need to write it
-- directly (insert only sets task_id; project_id is filled in server-side).
--
-- author_id is the real owner/edit-own column phase 2 chunk 1 confirmed
-- was missing - references auth.users directly, same pattern as
-- tasks.assignee_user_id.

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_idx on task_comments (task_id);

-- Keeps project_id in sync with the parent task's project_id, so callers
-- never have to (and can't accidentally) set it to the wrong project - only
-- task_id needs to be supplied on insert.
create or replace function public.set_task_comment_project_id()
returns trigger
language plpgsql
as $$
begin
  select project_id into new.project_id from tasks where id = new.task_id;
  return new;
end;
$$;

drop trigger if exists task_comments_set_project_id on task_comments;
create trigger task_comments_set_project_id
  before insert on task_comments
  for each row
  execute function public.set_task_comment_project_id();

drop trigger if exists task_comments_set_updated_at on task_comments;
create or replace function public.set_task_comment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger task_comments_set_updated_at
  before update on task_comments
  for each row
  execute function public.set_task_comment_updated_at();

alter table task_comments enable row level security;

-- View: any project member (owner, editor, or viewer) - same as tasks'
-- own "project members can view" policy.
create policy "project members can view" on task_comments
  for select to authenticated
  using (has_project_access(project_id));

-- Insert: any project member, deliberately not can_edit_project -
-- commenting is not an "edit the plan" action, a viewer should be able to
-- leave a comment same as an editor. with_check also pins author_id to the
-- caller so nobody can post a comment under someone else's identity.
create policy "project members can comment" on task_comments
  for insert to authenticated
  with check (has_project_access(project_id) and author_id = auth.uid());

-- Update/delete: author only, regardless of project role - an editor or
-- owner cannot edit/delete another member's comment, only their own.
create policy "author can update own comment" on task_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "author can delete own comment" on task_comments
  for delete to authenticated
  using (author_id = auth.uid());
