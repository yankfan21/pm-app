import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import AppHeader from './AppHeader'
import ProjectDetail from './ProjectDetail'

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

      // No session at all: treat like the pre-auth app (full read/write,
      // just no owner-only "Manage Access" UI - there's no owner to manage
      // access on behalf of).
      if (!user) {
        setRole('editor')
        setLoading(false)
        return
      }

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
      <div className="app">
        <AppHeader />
        <p className="charter-status">Loading...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="app">
        <AppHeader />
        <p className="error">{error || 'Project not found.'}</p>
        <Link to="/projects" className="btn-secondary back-link">
          &larr; Back to projects
        </Link>
      </div>
    )
  }

  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'

  return <ProjectDetail project={project} isOwner={isOwner} canEdit={canEdit} />
}

export default ProjectDetailPage
