-- Sprint Retro: one retro per sprint. went_well/didnt_go_well/action_items
-- are stored as jsonb arrays of {id, text} entries - matching how risk_logs
-- stores its list of risks (a jsonb array column, whole-array replace on
-- every edit) rather than a child table, since that's the established
-- pattern for "list of things belonging to one row" elsewhere in this app.
--
-- sprint_retros is a brand-new table (like sprints was for the Product
-- Backlog phase) so it needs its own RLS policies - matching the fully-open
-- posture every other table currently has.

create table if not exists sprint_retros (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  went_well jsonb not null default '[]'::jsonb,
  didnt_go_well jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sprint_retros_sprint_id_key
  on sprint_retros (sprint_id);

alter table sprint_retros enable row level security;

drop policy if exists "anon full access" on sprint_retros;
create policy "anon full access" on sprint_retros
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "authenticated full access (temporary)" on sprint_retros;
create policy "authenticated full access (temporary)" on sprint_retros
  for all
  to authenticated
  using (true)
  with check (true);
