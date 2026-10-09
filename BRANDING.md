# White-label branding: owner runbook

Branding is per organization and **owner-managed**. Customers cannot edit it and
there is no branding screen. You set everything from the Supabase dashboard:
the SQL editor for data, the Storage page for logos. Both bypass RLS, which is
why the migration grants clients read-only access.

A user sees the branding of the organization they belong to. If they belong to
several, the oldest membership wins (no switcher yet). A user with no
organization sees the stock app.

Branding only shows on the redesign (`VITE_REDESIGN=true`).

## Before you start

`supabase/migrations/organizations_branding.sql` must be applied first. It has
never been run anywhere, so apply it to a throwaway Supabase project and check
this runbook against it before touching production. In the SQL editor, use the
**Run** button for the whole file, not "run current statement".

## 1. Create an organization

```sql
insert into organizations (name, app_name, accent_color, rail_color)
values ('Northwind Logistics', 'Northwind Projects', '#b45309', '#1f2a44')
returning id;
```

- `name`: internal name, 1-80 characters.
- `app_name`: what users see in the sidebar instead of "ConfidantPM", 1-40
  characters, no `<`, `>` or control characters. Optional.
- `accent_color`: buttons, links and highlights. Exactly `#rrggbb`. Optional.
- `rail_color`: the sidebar background. Exactly `#rrggbb`. Optional.

Anything unset falls back to the stock look. Copy the returned `id`; the logo
step needs it.

Contrast is not enforced in the database. The app adjusts colors that would be
unreadable, so a poor choice can be stored but is never applied as-is.

## 2. Add users

The user must already have signed up (they exist in Authentication > Users).

```sql
insert into organization_members (organization_id, user_id)
select o.id, u.id
from organizations o, auth.users u
where o.name = 'Northwind Logistics'
  and u.email in ('alice@northwind.example', 'bob@northwind.example')
on conflict do nothing;
```

If an email is misspelled or hasn't signed up, it is silently skipped, so check
the result:

```sql
select u.email, m.created_at
from organization_members m
join organizations o on o.id = m.organization_id
join auth.users u on u.id = m.user_id
where o.name = 'Northwind Logistics'
order by m.created_at;
```

Remove a user:

```sql
delete from organization_members
where organization_id = (select id from organizations where name = 'Northwind Logistics')
  and user_id = (select id from auth.users where email = 'bob@northwind.example');
```

## 3. Change name and colors later

```sql
update organizations
set app_name     = 'Northwind Projects',
    accent_color = '#b45309',
    rail_color   = '#1f2a44'
where name = 'Northwind Logistics';
```

Set a field to `null` to go back to the default for that field. Users see
changes on their next load.

## 4. Upload a logo

Requirements: PNG, JPEG or WebP (no SVG), 1 MB max.

1. In the dashboard open **Storage > org-logos**. The bucket is created by the
   migration.
2. Create a folder named exactly the organization's `id` (the uuid from step 1).
   To look it up:
   ```sql
   select id from organizations where name = 'Northwind Logistics';
   ```
3. Upload the file inside that folder, for example
   `3f2b8c1e-.../logo.png`. The file name may use only letters, digits, `.`,
   `_` and `-`.
4. Point the organization at it. `logo_path` is `{organization_id}/{filename}`:
   ```sql
   update organizations
   set logo_path = id::text || '/logo.png'
   where name = 'Northwind Logistics';
   ```
   The database rejects a path outside the organization's own folder.

To replace a logo, upload under a **new file name** (for example `logo-2.png`)
and update `logo_path`, because the bucket is public and the old URL may be
cached. Then delete the old file from the Storage page.

To remove a logo, `update organizations set logo_path = null where ...;`.

## 5. Check it

Locally: put `VITE_DEV_BYPASS_AUTH=true` and `VITE_REDESIGN=true` in
`.env.local` and run `npm run dev`. Add `VITE_DEV_ORG=true` to see a sample
branded organization. That uses an in-memory fake, so it previews the look but
does not test your SQL; for that, sign in as a member against the throwaway
project.

## Delete an organization

```sql
delete from organizations where name = 'Northwind Logistics';
```

Memberships are removed with it (cascade). Delete its folder in the `org-logos`
bucket separately.
