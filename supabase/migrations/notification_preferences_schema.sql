-- STEP 1 of "Automated task notifications via Resend". Per-user, per-event,
-- per-channel opt-out table. Email is the only channel actually sent today
-- (send-task-notification Edge Function, built in this same batch); `channel`
-- is included now with 'push' as a valid-but-unused value so a future push
-- feature is additive (new rows/new channel value) instead of a schema
-- change - no push sending exists anywhere in this codebase yet.
--
-- Three event_type values, matching exactly what the notification trigger
-- (task_assignment_notification_trigger.sql) and cron job
-- (task_notification_cron.sql) fire: 'task_assigned', 'task_due_soon' (covers
-- both the 3-day and 1-day-out reminder - they're the same preference, just
-- different email copy), 'task_overdue'.
--
-- Row-per-(user, event_type, channel) rather than one row with boolean
-- columns per event - keeps this additive if a 4th event type shows up later
-- (new distinct values, no ALTER TABLE) and keeps the "default enabled"
-- backfill below a plain cross join instead of one column addition per event.
--
-- User-scoped, not project-scoped - preferences belong to the person, not
-- any project, so RLS here is a plain user_id = auth.uid() check, not the
-- has_project_access()/can_edit_project() helpers every project_id-scoped
-- table uses (see phase1_access_control_schema.sql /
-- phase4_full_lockdown_no_anon.sql). No anon policy - this project is
-- post-lockdown (phase4_full_lockdown_no_anon.sql already shipped), so every
-- new table gets the real authenticated-only model from day one, not the
-- historical "anon full access" starting point older tables had.

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('task_assigned', 'task_due_soon', 'task_overdue')),
  channel text not null check (channel in ('email', 'push')) default 'email',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_preferences_user_event_channel_key
  on notification_preferences (user_id, event_type, channel);

drop trigger if exists notification_preferences_set_updated_at on notification_preferences;
create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notification_preferences_set_updated_at
  before update on notification_preferences
  for each row
  execute function public.set_notification_preferences_updated_at();

alter table notification_preferences enable row level security;

drop policy if exists "user can view own preferences" on notification_preferences;
create policy "user can view own preferences" on notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user can insert own preferences" on notification_preferences;
create policy "user can insert own preferences" on notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user can update own preferences" on notification_preferences;
create policy "user can update own preferences" on notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user can delete own preferences" on notification_preferences;
create policy "user can delete own preferences" on notification_preferences
  for delete to authenticated
  using (user_id = auth.uid());

-- Backfill: every existing auth.users row gets all 3 event types enabled on
-- the email channel, so "default all events to enabled for existing users"
-- holds without anyone having to visit a settings screen first. A missing
-- row is also treated as "enabled" by send-task-notification (see that
-- function's preference-check step), so this backfill is a convenience for
-- a future preferences UI to have something to render, not a correctness
-- requirement.
insert into notification_preferences (user_id, event_type, channel, enabled)
select u.id, et.event_type, 'email', true
from auth.users u
cross join (values ('task_assigned'), ('task_due_soon'), ('task_overdue')) as et(event_type)
on conflict (user_id, event_type, channel) do nothing;

-- Keep new signups covered the same way, going forward - same
-- trigger-on-auth.users pattern demo_projects_auto_access.sql already uses
-- successfully in this project (fires for both email/password and Google
-- OAuth signups, since both insert into auth.users the same way).
create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_preferences (user_id, event_type, channel, enabled)
  values
    (new.id, 'task_assigned', 'email', true),
    (new.id, 'task_due_soon', 'email', true),
    (new.id, 'task_overdue', 'email', true)
  on conflict (user_id, event_type, channel) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_default_notification_prefs on auth.users;
create trigger on_auth_user_created_default_notification_prefs
  after insert on auth.users
  for each row
  execute function public.create_default_notification_preferences();

-- Verify afterward:
--
--   select count(*) from notification_preferences;
--   -- expect (number of auth.users rows) * 3
--
--   select event_type, channel, count(*) from notification_preferences
--   group by event_type, channel order by event_type, channel;
