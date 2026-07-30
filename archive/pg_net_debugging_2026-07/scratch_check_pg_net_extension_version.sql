-- Query 3: installed pg_net extension version
select extname, extversion
from pg_extension
where extname = 'pg_net';
