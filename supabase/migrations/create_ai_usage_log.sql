-- Per-user AI/assistant usage tracking, for the admin usage/cost page.
--
-- Every Anthropic-calling Edge Function (backlog-gen, budget, charter,
-- comms-plan, milestone-gen, post-mortem, project-eval, requirements,
-- retro-facts-gen, risk-log, task-gen) previously discarded the `usage`
-- block on every Anthropic API response and never resolved the caller's
-- identity - there was no per-user session count or cost data anywhere.
-- This table is the destination for that, written to by those functions.
--
-- Read-only access path is the admin-data Edge Function using the service
-- role key - no frontend code queries this table directly, so no
-- user-facing RLS policy is needed. RLS is enabled anyway with zero
-- policies (default-deny) so a future anon/authenticated grant doesn't
-- accidentally leave this wide open the way earlier tables in this app
-- started out (see supabase/migrations/README.md's "anon full access"
-- default-pattern history) - service role bypasses RLS entirely, so this
-- doesn't block the intended read path.

create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  project_id uuid references projects(id),
  function_name text not null,
  input_tokens int not null,
  output_tokens int not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_user_id_idx on ai_usage_log (user_id);
create index if not exists ai_usage_log_created_at_idx on ai_usage_log (created_at);

alter table ai_usage_log enable row level security;
