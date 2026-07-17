import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import AppHeader from './AppHeader'
import NewProjectFlow from './NewProjectFlow'

function ProjectsShell() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNewProject, setShowNewProject] = useState(false)

  useEffect(() => {
    async function loadProjects() {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // Hidden is per-user and lives on project_collaborators, not
      // projects, so it isn't covered by RLS on the query above - filter
      // client-side the same way ProjectList already joins in evaluations.
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('project_collaborators')
        .select('project_id')
        .eq('user_id', user.id)
        .eq('hidden', true)

      if (hiddenError) {
        setError(hiddenError.message)
        setProjects(data)
        setLoading(false)
        return
      }

      const hiddenIds = new Set((hiddenRows || []).map((r) => r.project_id))
      setProjects(data.filter((p) => !hiddenIds.has(p.id)))
      setLoading(false)
    }

    loadProjects()
  }, [user.id])

  // Hides a project from this user's own list only (project_collaborators
  // row - see hide_project_from_list.sql). Removes it from local state
  // immediately rather than refetching, matching the optimistic-update
  // pattern used elsewhere (toggleComplete in ProjectDetail.jsx).
  async function hideProject(projectId) {
    const { error } = await supabase.rpc('set_collaborator_project_hidden', {
      p_project_id: projectId,
      p_hidden: true,
    })

    if (error) {
      setError(error.message)
      return
    }

    setProjects((prev) => prev.filter((p) => p.id !== projectId))
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="app-body">
        <div className="projects-toolbar">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowNewProject(true)}
          >
            <span aria-hidden="true">+</span> New Project
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <Outlet context={{ projects, loading, hideProject }} />
      </div>

      {showNewProject && (
        <NewProjectFlow
          onClose={() => setShowNewProject(false)}
          onCreated={(project) => {
            setShowNewProject(false)
            navigate(`/projects/${project.id}`)
          }}
        />
      )}
    </div>
  )
}

export default ProjectsShell
