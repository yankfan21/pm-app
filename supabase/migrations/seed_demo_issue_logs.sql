-- Seeds sample Issues Log content for the 3 demo projects, so the feature
-- demonstrates itself out of the box instead of showing empty (see
-- add_issue_logs_to_demo_reset.sql - that migration only wired up the
-- nightly-reset snapshot/restore, it never seeded any rows; issue_logs was
-- empty on every demo project before and after it ran).
--
-- Same one-row-per-project/jsonb-array shape as issue_logs.sql: each demo
-- project gets a single issue_logs row with 1-2 issue objects in its
-- `issues` array. Idempotent via `on conflict (project_id)` (issue_logs has
-- a unique index on project_id, see issue_logs.sql:33-34) - safe to re-run,
-- last run wins.

-- ── Customer Portal Redesign ────────────────────────────────────────────
insert into issue_logs (project_id, issues)
select id, jsonb_build_array(
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
from projects where name = 'Customer Portal Redesign' and is_demo = true
on conflict (project_id) do update set issues = excluded.issues, updated_at = now();

-- ── Loyalty Rewards Mobile App ──────────────────────────────────────────
insert into issue_logs (project_id, issues)
select id, jsonb_build_array(
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
from projects where name = 'Loyalty Rewards Mobile App' and is_demo = true
on conflict (project_id) do update set issues = excluded.issues, updated_at = now();

-- ── Regional Expansion Rollout ───────────────────────────────────────────
insert into issue_logs (project_id, issues)
select id, jsonb_build_array(
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
from projects where name = 'Regional Expansion Rollout' and is_demo = true
on conflict (project_id) do update set issues = excluded.issues, updated_at = now();

-- ── STEP 2 - required, runs automatically as part of this same paste ────
-- Bakes the freshly seeded rows above into the nightly-reset baseline
-- (issue_logs_demo_snapshot). Without this, tonight's reset would wipe
-- issue_logs back to empty since the last-captured baseline predates this
-- seed. Safe to re-run standalone later if you edit the seed content again.
select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select p.name, jsonb_array_length(il.issues) as issue_count
--   from issue_logs il join projects p on p.id = il.project_id
--   where p.is_demo = true;
--
--   select p.name, jsonb_array_length(s.issues) as snapshot_issue_count
--   from issue_logs_demo_snapshot s join projects p on p.id = s.project_id;
