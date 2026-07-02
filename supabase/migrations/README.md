# Migrations

These aren't applied automatically - there's no linked Supabase CLI project,
so each file is meant to be pasted into the Supabase Dashboard's SQL editor
and run by hand.

**Use the "Run" button (runs the whole file), not "run current statement" /
Ctrl+Enter.** The RLS policy at the end of a migration has twice been
silently skipped this way - the table got created, everything looked fine,
and the app failed with a row-level security error the first time it tried
to insert. If that happens again, run this to check what's actually true in
the database rather than guessing:

```sql
select relname, relrowsecurity from pg_class where relname = '<table_name>';
select policyname, roles, cmd from pg_policies where tablename = '<table_name>';
```

## Standard pattern for a new per-project document table

This app has no per-user auth - the frontend talks to Postgres directly with
the anon key - so every table needs an explicit permissive policy for the
`anon` role. This Supabase project auto-enables RLS (deny-all) on new
tables, so skipping the policy step means silent insert/update failures.

Prefer granting a policy over `disable row level security`: a policy grants
access no matter what enables or re-enables RLS, whereas relying on RLS
being off is one more thing that can silently revert.

```sql
create table if not exists <table_name> (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- ...columns...
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists <table_name>_project_id_key
  on <table_name> (project_id);

alter table <table_name> enable row level security;

drop policy if exists "anon full access" on <table_name>;
create policy "anon full access" on <table_name>
  for all
  to anon
  using (true)
  with check (true);
```
