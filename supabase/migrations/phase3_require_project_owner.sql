-- PHASE 3 of the auth/access-control rollout.
--
-- Run this ONLY after you've signed up for your own account (Phase 2's
-- /login page must be deployed and used at least once) AND have run the
-- one-time backfill below to give every pre-existing project a real owner
-- - phase1's owner_id column was left nullable specifically because no
-- project had an owner before this rollout.
--
-- 1. Find your own user id: Supabase Dashboard -> Authentication -> Users,
--    copy the UUID next to your account (or `select id from auth.users
--    where email = 'you@example.com'`).
-- 2. Backfill every project that predates this feature to that id:
--
--      update projects set owner_id = '<your-user-id>' where owner_id is null;
--
-- 3. Then run the statement below to require every project to have an
--    owner from now on.

alter table projects alter column owner_id set not null;
