-- Query 1: list all tables/views in net schema
select table_name, table_type
from information_schema.tables
where table_schema = 'net'
order by table_name;
