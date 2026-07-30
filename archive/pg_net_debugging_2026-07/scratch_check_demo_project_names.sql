-- Scratch check only, not part of migration history. Confirms exact current
-- `name` string (incl. punctuation/spacing) for the 3 demo projects before
-- any rename to strip the redundant "(Methodology)" suffix.
select id, name, methodology, is_demo
from projects
where is_demo = true
order by name;
