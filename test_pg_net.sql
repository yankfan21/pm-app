select net.http_post(
  url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
) as request_id;