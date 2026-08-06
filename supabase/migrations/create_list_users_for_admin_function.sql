-- admin-data (the hidden /admin page's Edge Function) originally called
-- supabase-js's auth.admin.listUsers() to enumerate users. That GoTrue admin
-- endpoint is currently returning "Database error finding users" (500) on
-- every call, regardless of pagination params - confirmed via a throwaway
-- diagnostic Edge Function hitting it directly, while ordinary PostgREST
-- queries (projects, project_collaborators, ai_usage_log) and a direct SQL
-- select against auth.users both work fine. This is a GoTrue-side fault, not
-- something fixable from application code.
--
-- Route around it the same way this project already does for "resolve one
-- user by email" (see find_user_id_by_email in phase1_access_control_schema.sql):
-- a SECURITY DEFINER function that reads auth.users directly via SQL, so
-- admin-data can stop depending on the broken admin API entirely.

create or replace function public.list_users_for_admin()
returns table (id uuid, email text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select id, email, created_at from auth.users order by created_at;
$$;

-- Admin-only surface - only the service role (admin-data's own client) should
-- ever call this, never anon/authenticated directly.
revoke all on function public.list_users_for_admin() from public, anon, authenticated;
grant execute on function public.list_users_for_admin() to service_role;
