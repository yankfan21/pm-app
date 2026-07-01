import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import NewProjectFlow from './NewProjectFlow'
import ProjectDetail from './ProjectDetail'
import './App.css'

function App() {
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

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    )
  }

  return (
    <div className="app">
      <h1 className="app-title">
        <span className="app-title-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </span>
        PM-App
      </h1>
      <p className="app-subtitle">Your Project Management Assistant</p>

      <div className="section-header">
        <h2 className="page-title">Projects</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowNewProject(true)}
        >
          <span aria-hidden="true">+</span> New Project
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <ul className="project-list">
        {projectsLoading && <li className="empty">Loading...</li>}
        {!projectsLoading &&
          projects.map((project) => (
            <li
              key={project.id}
              className="clickable"
              onClick={() => setSelectedProject(project)}
            >
              <div className="project-name">{project.name}</div>
              <div className="project-goal">{project.goal}</div>
              <div className="project-meta">
                <span
                  className={`priority-badge ${project.priority.toLowerCase()}`}
                >
                  {project.priority}
                </span>
                <span>{project.deadline ?? 'TBD'}</span>
              </div>
            </li>
          ))}
        {!projectsLoading && projects.length === 0 && (
          <li className="empty">No projects yet</li>
        )}
      </ul>

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
