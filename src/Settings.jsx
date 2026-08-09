import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import AppShell from './AppShell'
import ContactSupportForm from './ContactSupportForm'
import { useDeviceMode } from './hooks/useDeviceMode'
import { resolveDeviceModeTarget, MOBILE_HOME, DESKTOP_HOME } from './deviceRouteMap'

const DEVICE_MODE_OPTIONS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
]

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
// toolbar, just the shared AppShell rail + page body.
function Settings() {
  const { user } = useAuth()
  const { mode, setOverride } = useDeviceMode()
  const location = useLocation()
  const navigate = useNavigate()
  const [hiddenProjects, setHiddenProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const contactSectionRef = useRef(null)

  // Lets the account-menu "Contact Support" link (AppShell.jsx) land here and
  // scroll straight to this section, rather than needing its own route/modal.
  useEffect(() => {
    if (location.hash === '#contact-support' && contactSectionRef.current) {
      contactSectionRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.hash])

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

  // Same session-only override as the mobile footer link
  // (MobileDesktopLink.jsx) - navigates to the mapped equivalent for
  // wherever this page falls back to (/settings is a shared path, so this
  // always lands on the chosen mode's home) rather than just flipping the
  // radio and leaving the desktop-styled Settings page on screen.
  function handleDeviceModeChange(next) {
    setOverride(next)
    const fallback = next === 'mobile' ? MOBILE_HOME : DESKTOP_HOME
    navigate(resolveDeviceModeTarget(next, location.pathname) || fallback)
  }

  return (
    <AppShell>
      <div className="app-body">
        <h2 className="page-title view-title">Settings</h2>

        <h3 className="settings-section-title">View Mode</h3>
        <p className="dashboard-subtitle">
          Choose Mobile or Desktop for this session only - resets to automatic
          detection based on your screen size next time you open ConfidantPM.
        </p>

        <div className="theme-option-group" role="radiogroup" aria-label="View Mode">
          {DEVICE_MODE_OPTIONS.map((option) => (
            <label key={option.value} className="theme-option">
              <input
                type="radio"
                name="deviceMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => handleDeviceModeChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>

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
                  Unhide
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="settings-section-title" id="contact-support" ref={contactSectionRef}>
          Contact / Support
        </h3>
        <p className="dashboard-subtitle">
          Have a question or ran into a problem? Send us a message and we&rsquo;ll get back to you.
        </p>
        <ContactSupportForm />
      </div>
    </AppShell>
  )
}

export default Settings
