-- Query 4: confirm net.http_request_queue has ever worked, any run
select count(*), min(created), max(created)
from net.http_request_queue;
