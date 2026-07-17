import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import AppHeader from './AppHeader'

function formatHiddenAt(hiddenAt) {
  if (!hiddenAt) return ''
  return new Date(hiddenAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Own top-level route (like ProjectDetailPage), not nested under
// ProjectsShell - it doesn't need the projects list or the "New Project"
// toolbar, just its own AppHeader + page body.
function Settings() {
  const { user } = useAuth()
  const [hiddenProjects, setHiddenProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadHiddenProjects() {
      setLoading(true)
      setError(null)

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('project_collaborators')
        .select('project_id, hidden_at')
        .eq('user_id', user.id)
        .eq('hidden', true)
        .order('hidden_at', { ascending: false })

      if (hiddenError) {
        setError(hiddenError.message)
        setLoading(false)
        return
      }

      if (hiddenRows.length === 0) {
        setHiddenProjects([])
        setLoading(false)
        return
      }

      const { data: projectRows, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', hiddenRows.map((r) => r.project_id))

      if (projectError) {
        setError(projectError.message)
        setLoading(false)
        return
      }

      const nameById = {}
      projectRows.forEach((p) => {
        nameById[p.id] = p.name
      })

      setHiddenProjects(
        hiddenRows.map((r) => ({
          projectId: r.project_id,
          name: nameById[r.project_id] ?? 'Untitled project',
          hiddenAt: r.hidden_at,
        }))
      )
      setLoading(false)
    }

    loadHiddenProjects()
  }, [user.id])

  async function unhideProject(projectId) {
    setError(null)

    const { error } = await supabase.rpc('set_collaborator_project_hidden', {
      p_project_id: projectId,
      p_hidden: false,
    })

    if (error) {
      setError(error.message)
      return
    }

    setHiddenProjects((prev) => prev.filter((p) => p.projectId !== projectId))
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="app-body">
        <h2 className="page-title view-title">Settings</h2>

        <h3 className="settings-section-title">Hidden Projects</h3>
        <p className="dashboard-subtitle">
          Projects you&rsquo;ve hidden from your own Dashboard and All Projects lists. Hiding is
          personal - it doesn&rsquo;t change your access or affect anyone else&rsquo;s view.
        </p>

        {error && <p className="error">{error}</p>}
        {loading && <p className="charter-status">Loading...</p>}

        {!loading && (
          <ul className="collaborator-list">
            {hiddenProjects.length === 0 && <li className="empty">No hidden projects</li>}
            {hiddenProjects.map((p) => (
              <li key={p.projectId} className="collaborator-row">
                <Link to={`/projects/${p.projectId}`} className="collaborator-email">
                  {p.name}
                </Link>
                {p.hiddenAt && (
                  <span className="settings-hidden-at">Hidden {formatHiddenAt(p.hiddenAt)}</span>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => unhideProject(p.projectId)}
                >
                  Restore to my list
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default Settings
