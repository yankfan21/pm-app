import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { METHODOLOGY_LABELS } from '../methodology'
import MobileScreenHint from './MobileScreenHint'

// Phone-mode home (/m/dashboard) - also doubles as the project switcher:
// "active project" in phone mode is just whichever project is in the URL
// (/m/projects/:projectId/...), so switching projects is tapping a
// different one here rather than a separate persisted-selection mechanism.
// Own minimal fetch (RLS scopes the result to projects this user owns or
// collaborates on) - not reusing ProjectsShell/AllProjects since those
// eager-load the full desktop projects-list chrome (New Project flow,
// hide-project, etc.) that phone mode doesn't need for this screen.
// Hidden-project filtering is app-level, not RLS-enforced (hidden lives on
// project_collaborators, per-user) - same second query ProjectsShell.jsx
// runs on desktop, duplicated here. Active/Archived toggle mirrors
// AllProjects.jsx's tab filter on projects.status - hidden stays excluded
// in both toggle states, it's a stronger/separate exclusion than Archived.
function MobileDashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('active')

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

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('project_collaborators')
        .select('project_id')
        .eq('user_id', user.id)
        .eq('hidden', true)

      if (cancelled) return

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
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const display = projects.filter((p) =>
    tab === 'archived' ? p.status === 'Archived' : p.status !== 'Archived'
  )

  return (
    <div>
      <h1 className="mobile-screen-title">Home</h1>

      <MobileScreenHint storageKey="cpm_home_hint_count">
        The mobile app gives you the pulse-check. The desktop app is where the full story unfolds.
      </MobileScreenHint>

      <div className="mobile-filter-row">
        <button
          type="button"
          className={`mobile-filter-chip ${tab === 'active' ? 'selected' : ''}`}
          onClick={() => setTab('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={`mobile-filter-chip ${tab === 'archived' ? 'selected' : ''}`}
          onClick={() => setTab('archived')}
        >
          Archived
        </button>
      </div>

      {loading && <p className="mobile-screen-stub">Loading projects...</p>}
      {error && <p className="mobile-error">{error}</p>}

      {!loading && !error && display.length === 0 && (
        <p className="mobile-screen-stub">
          {tab === 'archived' ? 'No archived projects.' : 'No projects yet.'}
        </p>
      )}

      {!loading && !error && display.length > 0 && (
        <ul className="mobile-project-list">
          {display.map((project) => (
            <li key={project.id}>
              <Link to={`/m/projects/${project.id}`} className="mobile-project-list-item">
                <span className="mobile-project-list-name">
                  <span className="mobile-project-list-name-text">{project.name}</span>
                  {project.is_demo && <span className="mobile-demo-badge">✦ Demo</span>}
                </span>
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
