import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import NewProjectFlow from './NewProjectFlow'
import ProjectDetail from './ProjectDetail'
import Dashboard from './Dashboard'
import AllProjects from './AllProjects'
import './App.css'

const VIEWS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'all-projects', label: 'All Projects' },
]

function App() {
  const [view, setView] = useState('dashboard')
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)

  useEffect(() => {
    async function loadProjects() {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) setError(error.message)
      else setProjects(data)
      setProjectsLoading(false)
    }

    loadProjects()
  }, [])

  function handleProjectUpdated(updatedProject) {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    )
    setSelectedProject(updatedProject)
  }

  function goHome() {
    setSelectedProject(null)
    setView('dashboard')
  }

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onProjectUpdated={handleProjectUpdated}
        onHome={goHome}
      />
    )
  }

  return (
    <div className="app">
      <AppHeader onHome={goHome} />

      <div className="app-nav-row">
        <nav className="app-nav">
          {VIEWS.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={view === key ? 'selected' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowNewProject(true)}
        >
          <span aria-hidden="true">+</span> New Project
        </button>
      </div>

      <h2 className="page-title view-title">
        {view === 'dashboard' ? 'Dashboard' : 'All Projects'}
      </h2>

      {error && <p className="error">{error}</p>}

      {view === 'dashboard' ? (
        <Dashboard
          projects={projects}
          loading={projectsLoading}
          onSelect={setSelectedProject}
        />
      ) : (
        <AllProjects
          projects={projects}
          loading={projectsLoading}
          onSelect={setSelectedProject}
        />
      )}

      {showNewProject && (
        <NewProjectFlow
          onClose={() => setShowNewProject(false)}
          onCreated={(project) => {
            setProjects((prev) => [...prev, project])
            setShowNewProject(false)
          }}
        />
      )}
    </div>
  )
}

export default App
