-- Collaborator cap fix: only editor-role collaborators count toward the
-- 5-cap. Viewer-role invites are unlimited and skip the cap check entirely.
--
-- Depends on: add_pending_collaborator_invites_and_cap.sql
-- (invite_project_collaborator, project_collaborators.status).
--
-- This repo's migrations folder has no numeric/sequential naming
-- convention - plain descriptive names, newest-first by mtime.

create or replace function public.invite_project_collaborator(
  p_project_id uuid,
  p_email text,
  p_role text
)
returns project_collaborators
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_existing_count integer;
  v_row project_collaborators;
begin
  select owner_id into v_owner_id from projects where id = p_project_id;

  if v_owner_id is null or v_owner_id <> auth.uid() then
    raise exception 'Only the project owner can invite collaborators.';
  end if;

  v_user_id := public.find_user_id_by_email(v_email);

  if v_user_id = auth.uid() then
    raise exception 'That''s you - you''re already the owner of this project.';
  end if;

  -- Cap now applies to editor-role rows only. Viewer invites skip the
  -- check entirely (always allowed), so no count is even run for them.
  if p_role = 'editor' then
    select count(distinct coalesce(pc.user_id::text, lower(pc.email)))
    into v_existing_count
    from project_collaborators pc
    join projects p on p.id = pc.project_id
    where p.owner_id = v_owner_id
      and pc.role = 'editor';

    if v_existing_count >= 5 then
      raise exception 'You''ve reached the limit of 5 editors across your projects. Remove an editor, invite this person as a viewer instead, or contact us about the Agency tier.';
    end if;
  end if;

  insert into project_collaborators (project_id, user_id, email, role, invited_by, status)
  values (
    p_project_id,
    v_user_id,
    v_email,
    p_role,
    auth.uid(),
    case when v_user_id is null then 'pending' else 'accepted' end
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.invite_project_collaborator(uuid, text, text) to authenticated;

-- Verify afterward -----------------------------------------------------------
--
-- Invite a 6th editor across your own projects (replace with a real
-- project id you own) - expect the new error text:
--   select invite_project_collaborator('<project-id>', 'sixth-editor@example.com', 'editor');
--
-- Invite an unlimited number of viewers - expect no cap error ever:
--   select invite_project_collaborator('<project-id>', 'nth-viewer@example.com', 'viewer');
