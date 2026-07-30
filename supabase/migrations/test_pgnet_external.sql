-- Standalone pg_net test against a known-good external URL, unrelated to our edge function.
-- Purpose: isolate whether pg_net/networking itself is broken, or whether the problem
-- is specific to reaching our Supabase project's edge function endpoint.

select net.http_post(
  url := 'https://httpbin.org/post',
  body := '{"test": "isolating pg_net"}'::jsonb,
  headers := '{"Content-Type": "application/json"}'::jsonb
) as request_id;
