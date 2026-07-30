select column_name, data_type
from information_schema.columns
where table_schema = 'net' and table_name = 'http_request_queue'
order by ordinal_position;
