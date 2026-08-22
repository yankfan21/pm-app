-- Prep for the new delete-account Edge Function (supabase/functions/delete-account).
-- Three FKs to auth.users(id) currently have no ON DELETE action (default
-- NO ACTION), which means auth.admin.deleteUser() fails outright the moment
-- the target user has ever invited a collaborator, submitted a contact
-- form, or made an AI-calling request - i.e. almost every real user. This
-- loosens exactly those three to ON DELETE SET NULL so deleteUser()
-- succeeds once the Edge Function has handled owned-project
-- transfer/deletion first.
--
-- projects.owner_id and task_comments.author_id are deliberately NOT
-- touched here:
--   - projects.owner_id stays NO ACTION on purpose - the Edge Function must
--     explicitly transfer or delete every owned project before calling
--     deleteUser(), never leave a project silently ownerless.
--   - task_comments.author_id already has ON DELETE CASCADE
--     (task_comments_schema.sql) - a deleted user's comments disappear from
--     any project they were on automatically, no change needed here.
--
-- Each FK's constraint name is looked up dynamically via pg_constraint
-- rather than assumed to be the default "<table>_<column>_fkey" spelling -
-- that default is very likely correct here but wasn't verified against the
-- live database, and this makes the migration correct either way.

-- ── project_collaborators.invited_by ────────────────────────────────────
-- Already nullable. Just needs the ON DELETE action added.

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'project_collaborators'::regclass
    and confrelid = 'auth.users'::regclass
    and pg_get_constraintdef(oid) like '%(invited_by)%';

  if v_conname is null then
    raise exception 'could not find FK constraint on project_collaborators.invited_by -> auth.users';
  end if;

  execute format('alter table project_collaborators drop constraint %I', v_conname);
end $$;

alter table project_collaborators
  add constraint project_collaborators_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete set null;

-- ── contact_submissions.user_id ─────────────────────────────────────────
-- This column is currently NOT NULL. An ON DELETE SET NULL action can't
-- satisfy a NOT NULL column - the moment it fired, the SET NULL update
-- would itself raise a not-null violation, and deleteUser() would still
-- fail. Dropping the NOT NULL constraint here is required for the intended
-- behavior to actually work, not just a schema tidy-up.

alter table contact_submissions alter column user_id drop not null;

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'contact_submissions'::regclass
    and confrelid = 'auth.users'::regclass
    and pg_get_constraintdef(oid) like '%(user_id)%';

  if v_conname is null then
    raise exception 'could not find FK constraint on contact_submissions.user_id -> auth.users';
  end if;

  execute format('alter table contact_submissions drop constraint %I', v_conname);
end $$;

alter table contact_submissions
  add constraint contact_submissions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ── ai_usage_log.user_id ────────────────────────────────────────────────
-- Already nullable, column-wise. Drop/recreate unconditionally rather than
-- branching on the current action, so this migration is correct regardless
-- of what's actually live today (matches this file's "don't assume,
-- verify/fix" approach for the other two).

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'ai_usage_log'::regclass
    and confrelid = 'auth.users'::regclass
    and pg_get_constraintdef(oid) like '%(user_id)%';

  if v_conname is null then
    raise exception 'could not find FK constraint on ai_usage_log.user_id -> auth.users';
  end if;

  execute format('alter table ai_usage_log drop constraint %I', v_conname);
end $$;

alter table ai_usage_log
  add constraint ai_usage_log_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Verify afterward - expect 'a' (ON DELETE SET NULL, confdeltype = 'n') for
-- all three, and confdeltype = 'a' (NO ACTION) still for projects.owner_id:
--
--   select conrelid::regclass as table_name, conname, confdeltype
--   from pg_constraint
--   where confrelid = 'auth.users'::regclass
--   order by conrelid::regclass::text;
--
-- confdeltype codes: a = NO ACTION, n = SET NULL, c = CASCADE.
