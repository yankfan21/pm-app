import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import NewProjectFlow from './NewProjectFlow'

function ProjectsShell() {
  const navigate = useNavigate()
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

      if (error) setError(error.message)
      else setProjects(data)
      setLoading(false)
    }

    loadProjects()
  }, [])

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

        <Outlet context={{ projects, loading }} />
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
