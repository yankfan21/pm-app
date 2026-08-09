import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import AppShell from './AppShell'
import ProjectDetailLayout from './ProjectDetailLayout'

function ProjectDetailPage() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [role, setRole] = useState(null) // 'owner' | 'editor' | 'viewer' | null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProject() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()

      if (cancelled) return

      // RLS already means a non-member's query above returns no row at all
      // - "not found" is the right message either way, since revealing
      // "this project exists but you can't see it" would leak more than
      // just saying nothing's there.
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (!data) {
        setError('Project not found.')
        setLoading(false)
        return
      }

      setProject(data)

      // RequireAuth guarantees a session exists for every route this
      // component mounts on, and phase4_full_lockdown_no_anon.sql removed
      // the last carve-out that let a null owner_id be readable at all -
      // so `data` here always belongs to either this user (owner) or a
      // project they're a real collaborator on.
      if (data.owner_id === user.id) {
        setRole('owner')
        setLoading(false)
        return
      }

      const { data: collaboratorRow, error: collabError } = await supabase
        .from('project_collaborators')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (collabError) setError(collabError.message)
      else setRole(collaboratorRow?.role ?? null)
      setLoading(false)
    }

    loadProject()
    return () => {
      cancelled = true
    }
  }, [projectId, user?.id])

  if (loading) {
    return (
      // Global-mode rail deliberately - there's no project loaded yet to
      // build a project nav from, and a rail that's simply not project-aware
      // for a moment beats one that pops in after the fetch resolves.
      <AppShell>
        <div className="app-body">
          <p className="charter-status">Loading...</p>
        </div>
      </AppShell>
    )
  }

  if (error || !project) {
    return (
      // Global mode for the same reason as the loading branch above - and
      // here there genuinely is no project to navigate, so project-mode nav
      // would have nothing to show anyway.
      <AppShell>
        <div className="app-body">
          <p className="error">{error || 'Project not found.'}</p>
          <Link to="/projects" className="btn-secondary back-link">
            &larr; Back to projects
          </Link>
        </div>
      </AppShell>
    )
  }

  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'

  return <ProjectDetailLayout project={project} isOwner={isOwner} canEdit={canEdit} />
}

export default ProjectDetailPage
