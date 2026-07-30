select id, method, url, timeout_milliseconds
from net.http_request_queue
order by id desc
limit 10;
