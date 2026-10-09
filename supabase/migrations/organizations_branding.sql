-- White-label branding: organizations, membership, and a logo bucket.
--
-- An organization carries the branding a customer's users see after they sign
-- in: app name, logo, accent colour and rail (sidebar) colour. A user's
-- organization is whichever one they are a member of (oldest membership wins
-- when there is more than one; the app does not offer a switcher yet).
--
-- WHO CAN DO WHAT
--   * Read:   members read their own organization, their own membership rows and
--             their organization's logos; nobody else can.
--   * Write:  nobody from the client. Branding is owner-managed: the platform
--             owner creates organizations, manages membership, sets branding and
--             uploads logos from the Supabase dashboard (SQL editor / Storage
--             page) or the service role, which bypass RLS. There are no client
--             INSERT/UPDATE/DELETE policies or grants on organizations or
--             organization_members, and none for writes to the logo bucket, so
--             a signed-in user cannot grant themselves membership, create an
--             organization or change branding. See BRANDING.md.
--
-- VALUES ARE VALIDATED IN THE DATABASE, not just the UI. Colours must be exactly
-- #rrggbb, because the app writes them into CSS. app_name may not contain < >
-- or control characters, because it will also appear in emails and exports.
-- logo_path must sit inside the organization's own folder of the logo bucket.
--
-- Contrast is NOT enforced here: Postgres is the wrong place for it. The app
-- derives its tokens from the stored colours and adjusts any that would be
-- unreadable (src/branding/color.js, with tests), so an unreadable colour can
-- be stored but is never applied as-is.
--
-- This file is idempotent: safe to run more than once. Use the dashboard's
-- "Run" button (whole file), not "run current statement" - see README.md.

-- ── tables ────────────────────────────────────────────────────────────

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  app_name text
    check (app_name is null or (char_length(app_name) between 1 and 40 and app_name !~ '[<>[:cntrl:]]')),
  logo_path text,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  rail_color text check (rail_color is null or rail_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_logo_path_in_own_folder
    check (logo_path is null or logo_path ~ ('^' || id::text || '/[A-Za-z0-9._-]+$'))
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on organization_members (user_id);

-- Keep updated_at honest without trusting the client to send it.
create or replace function public.organizations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on organizations;
create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function public.organizations_set_updated_at();

-- ── access helpers ────────────────────────────────────────────────────
-- SECURITY DEFINER so the membership lookup is not itself filtered by the
-- policies that call it (which would recurse). search_path is pinned.

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- ── row level security ────────────────────────────────────────────────

alter table organizations enable row level security;
alter table organization_members enable row level security;

drop policy if exists "members can read their organization" on organizations;
create policy "members can read their organization" on organizations
  for select to authenticated
  using (public.is_org_member(id));

drop policy if exists "users can read their own memberships" on organization_members;
create policy "users can read their own memberships" on organization_members
  for select to authenticated
  using (user_id = auth.uid());

-- Supabase grants new public tables to anon/authenticated by default; narrow
-- that to exactly what the policies above intend.
revoke all on organizations from anon, authenticated;
revoke all on organization_members from anon, authenticated;
grant select on organizations to authenticated;
grant select on organization_members to authenticated;

-- ── logo storage ──────────────────────────────────────────────────────
-- org_id_from_logo_path never raises: it returns NULL for any object name that
-- is not "{uuid}/...", so these policies cannot throw a cast error on objects
-- in other buckets (Postgres does not guarantee that bucket_id = '...' is
-- evaluated before the cast). is_org_member(NULL) is false.
create or replace function public.org_id_from_logo_path(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- Public bucket: a logo is not a secret, and a public URL works in <img>
-- tags, exports and emails without signed-URL plumbing. Raster formats only
-- (no SVG: an SVG opened directly can carry script). Objects live at
-- {organization_id}/{filename}; org_id_from_logo_path(name) recovers the
-- organization id, which is what the member read policy checks. Uploads are done
-- by the owner from the dashboard, which bypasses RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "org logos: members can view" on storage.objects;
create policy "org logos: members can view"
on storage.objects for select
to authenticated
using (
  bucket_id = 'org-logos'
  and public.is_org_member(public.org_id_from_logo_path(name))
);

-- ── creating an organization ─────────────────────────────────────────
-- Not done by this migration. Copy-paste SQL for creating organizations, adding
-- users, setting branding and uploading logos is in BRANDING.md.
