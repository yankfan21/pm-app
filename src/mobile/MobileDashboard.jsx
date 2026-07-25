import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { METHODOLOGY_LABELS } from '../methodology'

// Phone-mode home (/m/dashboard) - also doubles as the project switcher:
// "active project" in phone mode is just whichever project is in the URL
// (/m/projects/:projectId/...), so switching projects is tapping a
// different one here rather than a separate persisted-selection mechanism.
// Own minimal fetch (RLS already scopes the result to projects this user
// owns or collaborates on, same query ProjectsShell.jsx uses on desktop) -
// not reusing ProjectsShell/AllProjects since those eager-load the full
// desktop projects-list chrome (New Project flow, hide-project, etc.) that
// phone mode doesn't need for this screen.
function MobileDashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProjects() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setProjects(data)
      setLoading(false)
    }

    loadProjects()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <div>
      <h1 className="mobile-screen-title">Home</h1>

      {loading && <p className="mobile-screen-stub">Loading projects...</p>}
      {error && <p className="mobile-error">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <p className="mobile-screen-stub">No projects yet.</p>
      )}

      {!loading && !error && projects.length > 0 && (
        <ul className="mobile-project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/m/projects/${project.id}`} className="mobile-project-list-item">
                <span className="mobile-project-list-name">{project.name}</span>
                <span className="mobile-project-list-meta">
                  {METHODOLOGY_LABELS[project.methodology] ?? project.methodology}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MobileDashboard
