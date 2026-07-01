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
      <div className="section-header">
        <h1>Projects</h1>
        <button type="button" onClick={() => setShowNewProject(true)}>
          New Project
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
