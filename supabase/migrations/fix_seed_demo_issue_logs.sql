-- Fixes seed_demo_issue_logs.sql: that script's `where name = '...'` matched
-- 0 rows (confirmed via scratch_check_seed_result.sql - matched count was 0
-- for all 3), so its INSERT silently no-op'd. Root cause presumed to be a
-- suffix on the stored `name` (e.g. "(Waterfall)"/"(Agile)"/"(Hybrid)" - see
-- demo_projects_auto_access.sql:34-36 comments) that the literal string
-- match didn't account for.
--
-- Fix: match on project id instead of name. Same 3 ids
-- demo_projects_auto_access.sql itself uses as its stable anchor (id ->
-- owner_id/is_demo backfill) - immune to the name/suffix question entirely,
-- and to any future rename.
--
-- Idempotent via `on conflict (project_id) do nothing` (issue_logs has a
-- unique index on project_id, issue_logs.sql:33-34): first run inserts,
-- every run after is a no-op rather than clobbering rows.

-- ── Customer Portal Redesign (id acc57a71-05dd-420a-9dc6-7111b9a5a9a1) ──
insert into issue_logs (project_id, issues)
values (
  'acc57a71-05dd-420a-9dc6-7111b9a5a9a1',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'Design vendor delivered final mockups two weeks late, compressing the dev handoff window.',
      'priority', 'High',
      'owner', 'Priya Nair',
      'status', 'In Progress',
      'resolution', '',
      'resolution_date', null
    ),
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'Legacy account-lookup API returns inconsistent field casing, breaking the new portal''s data mapping layer.',
      'priority', 'Medium',
      'owner', 'Marcus Webb',
      'status', 'Closed',
      'resolution', 'Added a normalization shim in the API client; platform team has a proper fix scheduled for their next release.',
      'resolution_date', '2026-06-18'
    )
  )
)
on conflict (project_id) do nothing;

-- ── Loyalty Rewards Mobile App (id 493afc03-a7de-4131-aaf1-26d4c728a559) ──
insert into issue_logs (project_id, issues)
values (
  '493afc03-a7de-4131-aaf1-26d4c728a559',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'App Store review rejected the build over unclear points-redemption terms in the purchase flow.',
      'priority', 'High',
      'owner', 'Dana Okafor',
      'status', 'Open',
      'resolution', '',
      'resolution_date', null
    ),
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'Push notification vendor''s sandbox environment was down for 3 days, blocking QA on reward-expiry alerts.',
      'priority', 'Low',
      'owner', 'Jordan Blake',
      'status', 'Closed',
      'resolution', 'Vendor restored sandbox; QA re-ran and signed off on the alert flow.',
      'resolution_date', '2026-07-02'
    )
  )
)
on conflict (project_id) do nothing;

-- ── Regional Expansion Rollout (id bec4c7ea-4f33-4101-9f23-ebd8d39956f1) ──
insert into issue_logs (project_id, issues)
values (
  'bec4c7ea-4f33-4101-9f23-ebd8d39956f1',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'Local compliance filing for the new region is stuck in legal review, at risk of missing the launch date.',
      'priority', 'High',
      'owner', 'Elena Voss',
      'status', 'In Progress',
      'resolution', '',
      'resolution_date', null
    ),
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'Regional logistics partner quoted a lead time double what was budgeted for initial inventory placement.',
      'priority', 'Medium',
      'owner', 'Tomas Reyes',
      'status', 'Pending',
      'resolution', '',
      'resolution_date', null
    )
  )
)
on conflict (project_id) do nothing;

-- ── STEP 2 - required, runs automatically as part of this same paste ────
-- Bakes the now-actually-inserted rows into the nightly-reset baseline
-- (issue_logs_demo_snapshot). The previous seed's own capture_demo_snapshot()
-- call captured 0 rows (same silent no-op), so this still needs to run.
select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select p.id, p.name, jsonb_array_length(il.issues) as issue_count
--   from issue_logs il join projects p on p.id = il.project_id
--   where p.is_demo = true;
--
--   select p.id, p.name, jsonb_array_length(s.issues) as snapshot_issue_count
--   from issue_logs_demo_snapshot s join projects p on p.id = s.project_id;
