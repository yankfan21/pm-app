-- Auto-collaborator access + system ownership + demo flag for the 3 shared
-- demo projects (Customer Portal Redesign, Loyalty Rewards Mobile App,
-- Regional Expansion Rollout). Every new signup becomes an Editor
-- collaborator on all 3 automatically, via a trigger on auth.users itself
-- (not signup-time frontend code) - fires identically for every signup
-- path (email/password and Google OAuth both insert a row there), so
-- nothing in Login.jsx needs to know this exists, and it can't be skipped
-- by a signup that completes but doesn't run some later client-side step.
--
-- PREREQUISITE (done): a dedicated "system" auth.users account owns these
-- 3 projects. owner_id references auth.users(id) and can't be null - the
-- entire point is these 3 shouldn't fall into the same "unclaimed" bucket
-- phase4_full_lockdown_no_anon.sql leaves every other un-backfilled
-- project in. yankfan211+pmappsystem@gmail.com (id
-- dca6a2e5-4501-47c9-9f32-c88d0b35da66) was inserted directly into
-- auth.users - it never logs in and was never sent a confirmation email
-- (Supabase's signup API was email-rate-limited right after creating the
-- demo-seed account), it exists purely as an owner_id/invited_by FK
-- anchor.
--
-- Side effect worth knowing before running this: the moment owner_id is
-- set on these 3 (independent of whether phase4_full_lockdown_no_anon.sql
-- has run yet), the existing "anyone can view unclaimed projects" / "is
-- unclaimed" anon policies stop applying to them - anonymous (not signed
-- in) visitors immediately lose the ability to see or open these 3
-- projects, even before the full lockdown migration runs. Only signed-in
-- accounts (auto-granted Editor via the trigger below) can see them from
-- that point on. This is presumably the intended effect given the
-- signup-incentive goal, flagging it since it's an immediate behavior
-- change tied to this migration alone.

update projects set owner_id = 'dca6a2e5-4501-47c9-9f32-c88d0b35da66'
where id in (
  'acc57a71-05dd-420a-9dc6-7111b9a5a9a1', -- Customer Portal Redesign (Waterfall)
  '493afc03-a7de-4131-aaf1-26d4c728a559', -- Loyalty Rewards Mobile App (Agile)
  'bec4c7ea-4f33-4101-9f23-ebd8d39956f1'  -- Regional Expansion Rollout (Hybrid)
);

-- Demo flag - drives the frontend badge/badge (ProjectList.jsx) and banner
-- (ProjectDetail.jsx), and gives any future nightly-reset job a plain
-- `where is_demo = true` to select on instead of hardcoding these 3 ids a
-- second/third place.
alter table projects add column if not exists is_demo boolean not null default false;

update projects set is_demo = true
where id in (
  'acc57a71-05dd-420a-9dc6-7111b9a5a9a1',
  '493afc03-a7de-4131-aaf1-26d4c728a559',
  'bec4c7ea-4f33-4101-9f23-ebd8d39956f1'
);

-- Trigger: every new auth.users row gets an Editor collaborator row on all
-- 3 demo projects (Editor, not Viewer, per the requirement that new
-- signups can fully interact - generate docs, mark tasks done, etc.).
-- security definer so it can write project_collaborators regardless of the
-- inserting session's own RLS - same pattern already used by
-- is_project_owner/has_project_access/can_edit_project in phase1.
create or replace function public.grant_demo_project_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  system_user_id uuid := 'dca6a2e5-4501-47c9-9f32-c88d0b35da66';
begin
  -- Guard so the system account itself never gets redundantly added as
  -- its own collaborator if it's ever recreated - harmless either way
  -- (it's already the owner), just superfluous.
  if new.id = system_user_id then
    return new;
  end if;

  insert into project_collaborators (project_id, user_id, email, role, invited_by)
  values
    ('acc57a71-05dd-420a-9dc6-7111b9a5a9a1', new.id, new.email, 'editor', system_user_id),
    ('493afc03-a7de-4131-aaf1-26d4c728a559', new.id, new.email, 'editor', system_user_id),
    ('bec4c7ea-4f33-4101-9f23-ebd8d39956f1', new.id, new.email, 'editor', system_user_id)
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_demo_access on auth.users;
create trigger on_auth_user_created_grant_demo_access
  after insert on auth.users
  for each row
  execute function public.grant_demo_project_access();

-- One-time backfill: anyone who already signed up before this trigger
-- existed (the demo-seed test account, and your own real account once
-- you've signed up for smoke testing) also gets added, so behavior doesn't
-- depend on signup date.
insert into project_collaborators (project_id, user_id, email, role, invited_by)
select demo_project.id, u.id, u.email, 'editor', 'dca6a2e5-4501-47c9-9f32-c88d0b35da66'
from auth.users u
cross join (
  values
    ('acc57a71-05dd-420a-9dc6-7111b9a5a9a1'::uuid),
    ('493afc03-a7de-4131-aaf1-26d4c728a559'::uuid),
    ('bec4c7ea-4f33-4101-9f23-ebd8d39956f1'::uuid)
) as demo_project(id)
where u.id <> 'dca6a2e5-4501-47c9-9f32-c88d0b35da66'
on conflict (project_id, user_id) do nothing;

-- Verify afterward:
--
--   select id, name, owner_id, is_demo from projects where is_demo = true;
--
--   select project_id, count(*) from project_collaborators
--   where project_id in (
--     'acc57a71-05dd-420a-9dc6-7111b9a5a9a1',
--     '493afc03-a7de-4131-aaf1-26d4c728a559',
--     'bec4c7ea-4f33-4101-9f23-ebd8d39956f1'
--   )
--   group by project_id;
