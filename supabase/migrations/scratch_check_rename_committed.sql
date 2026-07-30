-- Scratch check only, not part of migration history. Run this FIRST,
-- before add_owner_email_to_demo_snapshot.sql.
--
-- rename_demo_project_names.sql ran 3 UPDATEs then failed on the trailing
-- capture_demo_snapshot() call (missing owner_email column). Whether the
-- UPDATEs stuck depends on whether the SQL editor sent the whole script as
-- one implicit transaction (Postgres rolls back every statement in a
-- multi-statement simple-query string on any failure) - don't assume
-- either way, check live state.
--
-- If name still shows "(Waterfall)"/"(Agile)"/"(Hybrid)" below: the
-- UPDATEs rolled back, rename_demo_project_names.sql needs a full re-run
-- after the snapshot fix. If name already shows the plain form: the
-- UPDATEs committed, only capture_demo_snapshot() needs re-running (which
-- add_owner_email_to_demo_snapshot.sql already does at its end).
select id, name
from projects
where id in (
  'acc57a71-05dd-420a-9dc6-7111b9a5a9a1',
  '493afc03-a7de-4131-aaf1-26d4c728a559',
  'bec4c7ea-4f33-4101-9f23-ebd8d39956f1'
)
order by name;
