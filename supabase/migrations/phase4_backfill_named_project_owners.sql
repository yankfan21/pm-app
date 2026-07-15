-- One-time backfill, run BEFORE phase4_full_lockdown_no_anon.sql.
--
-- Of the ~17 existing projects (confirmed via live query 2026-07-15, all
-- currently owner_id null), only two are real, ongoing work that needs to
-- keep working under Scott's own account after the full lockdown removes
-- every anon/unclaimed-project carve-out:
--
--   - WMS Tower App        46fb50a1-916b-4a20-9a15-5a15c952a750
--   - Life Dashboard App   32ab1394-9994-46b4-b220-f3e3481b376f
--
-- ("WMS Control Tower", 2b7b9fc7-350c-4aa6-ae1a-c261e52c2273, is a separate,
-- earlier project explicitly marked status = 'Archived' in-app, created
-- 2026-07-09 - superseded by WMS Tower App. Deliberately excluded here.)
--
-- Every other existing project stays owner_id null on purpose - some are
-- disposable test data, some are earmarked to become reseedable demo
-- projects later (separate, future work). Once phase4_full_lockdown_no_anon.sql
-- runs, a null-owner project simply becomes inaccessible to everyone
-- (no anon/unclaimed carve-out exists anymore to reach it) - that's expected,
-- not a bug to fix here.
--
-- owner_id stays nullable at the column level (do NOT run
-- phase3_require_project_owner.sql's "set not null" - it would fail
-- immediately, since every other project is intentionally left null).
--
-- owner id confirmed 2026-07-15: scottsilvers@hotmail.com,
-- 351a60a0-bbfd-4b98-b12f-8869e1f43ed6.

update projects
set owner_id = '351a60a0-bbfd-4b98-b12f-8869e1f43ed6'
where id in (
  '46fb50a1-916b-4a20-9a15-5a15c952a750', -- WMS Tower App
  '32ab1394-9994-46b4-b220-f3e3481b376f'  -- Life Dashboard App
);

-- Verify afterward - expect exactly 2 rows, both with owner_id set to your id:
--
--   select id, name, owner_id from projects
--   where id in (
--     '46fb50a1-916b-4a20-9a15-5a15c952a750',
--     '32ab1394-9994-46b4-b220-f3e3481b376f'
--   );
