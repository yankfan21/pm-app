-- Collaborator invite flow fix: pending invites for emails with no account
-- yet, a real (DB-only) in-app notification record, and a hard 5-collaborator
-- cap per owner account (owner = projects.owner_id - no accounts/orgs table
-- exists or is added here, per explicit decision).
--
-- This repo's migrations folder has no numeric/sequential naming convention
-- (confirmed by listing the folder - every file is a plain descriptive name,
-- newest-first by mtime, not by filename). This file follows that same
-- descriptive-name convention rather than inventing a numbering scheme that
-- doesn't otherwise exist here.
--
-- Depends on: phase1_access_control_schema.sql (is_project_owner,
-- find_user_id_by_email, project_collaborators table), enable_pg_net.sql
-- (net.http_post, already enabled - reused here the same way
-- task_assignment_notification_trigger.sql uses it).
--
-- KNOWN LIMITATIONS (flagged, not fixed here - out of scope for this pass):
--   - The 5-collaborator cap is a hard, universal block, not tied to
--     actual paid/free tier - there is no billing system yet. Revisit once
--     billing exists.
--   - The cap counts by user_id when known, else by lower(email). A person
--     who is an accepted collaborator (user_id set) on one of the owner's
--     projects and separately has a *pending* invite (still user_id null,
--     different key) on another of the owner's projects before they sign up
--     can transiently count twice, until they sign up and the pending row
--     gets linked to their real user_id. Edge case, not corrected here.

-- ── project_collaborators: pending-invite support ──────────────────────────

alter table project_collaborators
  add column if not exists status text not null default 'accepted'
    check (status in ('pending', 'accepted'));
-- Existing rows: NOT NULL DEFAULT 'accepted' backfills every current row to
-- 'accepted' automatically - they already have instant access today, this
-- changes nothing for them.

alter table project_collaborators alter column user_id drop not null;
-- A pending invite to an email with no account yet has no user_id until
-- the linking trigger below fires on signup.

-- Verified: Postgres unique indexes treat NULL as distinct from every other
-- NULL by default (true in every Postgres version this project could be
-- running - NULLS DISTINCT is the implicit, unchanged default). So the
-- existing project_collaborators_project_user_key unique index on
-- (project_id, user_id) does NOT collide across multiple pending invites
-- (user_id null) for the same project - confirmed true, no change needed
-- to that index.
--
-- It does NOT, however, stop the same email being invited twice (pending)
-- to the same project - project_id/user_id can't see email at all while
-- user_id is null. That protection existed only incidentally before this
-- migration (every invite had a real user_id immediately). Closing that gap
-- explicitly here so "already invited" duplicate protection keeps working
-- for the pending path too:
create unique index if not exists project_collaborators_pending_email_key
  on project_collaborators (project_id, lower(email))
  where status = 'pending';

-- ── notifications: minimal new table (DB-only for now, no UI yet) ─────────
-- No in-app notification pattern existed anywhere in this codebase before
-- this migration (the mobile /m/notifications screen is an unwired stub -
-- "Nothing here yet"). This is the minimal shape to persist the data now;
-- a bell/feed UI is separate follow-up work (touches global shell/nav,
-- outside this pass's declared scope of ManageAccess.jsx and /projects/:id/...).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  project_id uuid references projects(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_id_idx on notifications (user_id);

alter table notifications enable row level security;

drop policy if exists "user can view own notifications" on notifications;
create policy "user can view own notifications" on notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Mark-as-read only (read_at) - no insert/delete policy for authenticated
-- at all. Rows are written exclusively by the security-definer trigger
-- functions below, the same "system writes, RLS only covers user reads/
-- acknowledges" shape notification_preferences uses for its own writes.
drop policy if exists "user can update own notifications" on notifications;
create policy "user can update own notifications" on notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── invite_project_collaborator RPC ────────────────────────────────────────
-- Replaces the old client-side "look up email, then insert" two-step
-- (ManageAccess.jsx used to call find_user_id_by_email directly, then
-- .insert() itself). Now a single round trip does the lookup, the
-- self-invite check, the cross-project cap check, and the insert
-- (pending if no account exists yet, accepted if one does) atomically.
--
-- Deliberately SECURITY INVOKER (the default - no "security definer"
-- clause), not definer: the caller must already be the project owner to
-- pass both the is_project_owner check below AND the underlying
-- "owner can add collaborators" / "project members can view collaborators"
-- RLS policies on project_collaborators, so there is no privilege this
-- function needs that the calling owner doesn't already have on their own
-- projects. Running as invoker keeps RLS fully in effect as a second,
-- independent layer under this function's own checks.
create or replace function public.invite_project_collaborator(
  p_project_id uuid,
  p_email text,
  p_role text
)
returns project_collaborators
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_existing_count integer;
  v_row project_collaborators;
begin
  select owner_id into v_owner_id from projects where id = p_project_id;

  if v_owner_id is null or v_owner_id <> auth.uid() then
    raise exception 'Only the project owner can invite collaborators.';
  end if;

  v_user_id := public.find_user_id_by_email(v_email);

  if v_user_id = auth.uid() then
    raise exception 'That''s you - you''re already the owner of this project.';
  end if;

  -- Cap is per owner account (= projects.owner_id, no accounts/orgs table),
  -- aggregated across every project that owner has, not just this one.
  -- Counts pending and accepted rows both.
  select count(distinct coalesce(pc.user_id::text, lower(pc.email)))
  into v_existing_count
  from project_collaborators pc
  join projects p on p.id = pc.project_id
  where p.owner_id = v_owner_id;

  if v_existing_count >= 5 then
    raise exception 'You''ve reached the limit of 5 collaborators across your projects. Remove a collaborator or contact us about the Agency tier.';
  end if;

  insert into project_collaborators (project_id, user_id, email, role, invited_by, status)
  values (
    p_project_id,
    v_user_id,
    v_email,
    p_role,
    auth.uid(),
    case when v_user_id is null then 'pending' else 'accepted' end
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.invite_project_collaborator(uuid, text, text) to authenticated;

-- ── side effects on every project_collaborators insert ─────────────────────
-- Fires regardless of whether the insert came from the RPC above or a
-- direct table insert, same separation-of-concerns
-- task_assignment_notification_trigger.sql uses (trigger owns the
-- notify-and-email side effect, not the code path that wrote the row).
--
-- SECURITY DEFINER: needs to write a notifications row for the invitee,
-- who is not the calling user (the project owner) - same reasoning as
-- create_default_notification_preferences() in notification_preferences_schema.sql.

create or replace function public.notify_collaborator_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text;
begin
  select name into v_project_name from projects where id = new.project_id;

  if new.status = 'accepted' and new.user_id is not null then
    insert into notifications (user_id, type, project_id, message)
    values (
      new.user_id,
      'collaborator_added',
      new.project_id,
      'You were added to ' || coalesce(v_project_name, 'a project') || ' as ' || new.role || '.'
    );

    perform net.http_post(
      url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-collaborator-invite',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'event_type', 'collaborator_added',
        'recipient_user_id', new.user_id,
        'recipient_email', new.email,
        'project_id', new.project_id,
        'project_name', v_project_name,
        'role', new.role
      )
    );
  elsif new.status = 'pending' then
    perform net.http_post(
      url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-collaborator-invite',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'event_type', 'collaborator_invite_signup',
        'recipient_email', new.email,
        'project_id', new.project_id,
        'project_name', v_project_name,
        'role', new.role
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_collaborator_invite on project_collaborators;
create trigger notify_collaborator_invite
  after insert on project_collaborators
  for each row
  execute function public.notify_collaborator_invite();

-- ── link pending invites to the new account on signup ───────────────────
-- Same "trigger on auth.users insert" pattern notification_preferences_schema.sql
-- already uses successfully (fires for both email/password and Google OAuth
-- signups, since both insert into auth.users the same way).

create or replace function public.link_pending_collaborator_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    update project_collaborators
    set user_id = new.id, status = 'accepted'
    where status = 'pending' and lower(email) = lower(new.email)
    returning project_id, role
  loop
    insert into notifications (user_id, type, project_id, message)
    select
      new.id,
      'collaborator_added',
      r.project_id,
      'You now have access to ' || coalesce(p.name, 'a project') || ' as ' || r.role || '.'
    from projects p
    where p.id = r.project_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_collaborator_invites on auth.users;
create trigger on_auth_user_created_link_collaborator_invites
  after insert on auth.users
  for each row
  execute function public.link_pending_collaborator_invites();

-- Verify afterward -----------------------------------------------------------
--
-- Column/index shape:
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'project_collaborators' and column_name in ('user_id', 'status');
--
--   select indexname, indexdef from pg_indexes where tablename = 'project_collaborators';
--
-- Invite an email with no account (replace with a real project id you own
-- and a throwaway email), then confirm a pending row was created:
--   select * from project_collaborators where email = 'nobody-yet@example.com';
--   -- expect status = 'pending', user_id null
--
-- Then sign up with that same email and confirm it flips:
--   select * from project_collaborators where email = 'nobody-yet@example.com';
--   -- expect status = 'accepted', user_id set to the new account's id
--
--   select * from notifications order by created_at desc limit 5;
--
-- Outbound Edge Function calls (once send-collaborator-invite is deployed):
--   select id, url, status_code, created
--   from net._http_response
--   order by created desc
--   limit 5;
