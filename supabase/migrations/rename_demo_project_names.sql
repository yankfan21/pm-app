-- Strips the redundant "(Waterfall)"/"(Agile)"/"(Hybrid)" methodology
-- suffix from the 3 demo projects' stored `name`. The methodology badge
-- already renders separately from the actual `methodology` column (see
-- src/methodology.js) - nothing parses `name` to derive it, so this is a
-- display-only rename, confirmed safe via prior investigation.
--
-- Matched by id, not name string (past bug class - see
-- fix_seed_demo_issue_logs.sql).
--
-- IMPORTANT: run this whole file as one script (Run button), not just the
-- UPDATEs. The final capture_demo_snapshot() call is required immediately
-- after the rename: projects_demo_snapshot still holds the OLD suffixed
-- names until recaptured, and the nightly restore_demo_projects() job
-- (08:00 UTC) copies name FROM the snapshot back onto the live row. Skip
-- the recapture and the rename silently reverts at the next nightly reset.

update projects set name = 'Customer Portal Redesign'
where id = 'acc57a71-05dd-420a-9dc6-7111b9a5a9a1';

update projects set name = 'Loyalty Rewards Mobile App'
where id = '493afc03-a7de-4131-aaf1-26d4c728a559';

update projects set name = 'Regional Expansion Rollout'
where id = 'bec4c7ea-4f33-4101-9f23-ebd8d39956f1';

select public.capture_demo_snapshot();
