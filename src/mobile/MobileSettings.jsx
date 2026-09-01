import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import MobileContactSupport from './MobileContactSupport'
import MobileDeleteAccount from './MobileDeleteAccount'
import { useDeviceMode } from '../hooks/useDeviceMode'
import { resolveDeviceModeTarget, MOBILE_HOME, DESKTOP_HOME } from '../deviceRouteMap'

// Mobile-native Settings (/m/settings) - root-level, not project-scoped (see
// MobileShell's sibling routes: /m/dashboard, /m/notifications, /m/more).
// Same View Mode/Hidden Projects functionality as desktop's Settings.jsx,
// purpose-built markup here rather than reusing that component - mirrors
// the MobileProjectStatusUpdate.jsx/MobileProjectRisks.jsx convention of
// not importing desktop views into phone mode. Hooks (useDeviceMode) and
// the hidden-projects Supabase calls are reused unchanged; only the
// JSX/CSS differs.

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

function MobileSettings() {
  const { user } = useAuth()
  const { mode, setOverride } = useDeviceMode()
  const location = useLocation()
  const navigate = useNavigate()
  const [hiddenProjects, setHiddenProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const contactSectionRef = useRef(null)

  // Lets the More-menu "Contact Support" link (MobileMore.jsx) land here and
  // scroll straight to this section, rather than needing its own route.
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

  // Same fallback shape as desktop Settings.jsx's handleDeviceModeChange -
  // /settings <-> /m/settings now has a real mapped equivalence in
  // deviceRouteMap.js, so resolveDeviceModeTarget lands on the other mode's
  // Settings screen directly rather than needing the home fallback.
  function handleDeviceModeChange(next) {
    setOverride(next)
    const fallback = next === 'mobile' ? MOBILE_HOME : DESKTOP_HOME
    navigate(resolveDeviceModeTarget(next, location.pathname) || fallback)
  }

  return (
    <div>
      <h1 className="mobile-screen-title">Settings</h1>

      {/* Hidden in native (Capacitor) builds - same reasoning as
          MobileDesktopLink.jsx's footer link: there is no "desktop site" to
          switch to inside the app shell, so exposing the desktop half of
          this toggle here would just strand a native user on the desktop
          tree at phone width. Mobile web at /m/ in a browser keeps it. */}
      {!Capacitor.isNativePlatform() && (
        <>
          <h2 className="mobile-section-title">View Mode</h2>
          <p className="mobile-screen-stub">
            Choose Mobile or Desktop for this session only - resets to automatic detection based
            on your screen size next time you open ConfidantPM.
          </p>

          <div className="mobile-settings-picker" role="radiogroup" aria-label="View Mode">
            {DEVICE_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                className={`mobile-settings-option ${mode === option.value ? 'selected' : ''}`}
                onClick={() => handleDeviceModeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="mobile-section-title">Hidden Projects</h2>
      <p className="mobile-screen-stub">
        Projects you&rsquo;ve hidden from your own Dashboard and All Projects lists. Hiding is
        personal - it doesn&rsquo;t change your access or affect anyone else&rsquo;s view.
      </p>

      {error && <p className="mobile-error">{error}</p>}
      {loading && <p className="mobile-screen-stub">Loading...</p>}

      {!loading && (
        <div className="mobile-doc-card-list">
          {hiddenProjects.length === 0 && <p className="mobile-screen-stub">No hidden projects</p>}
          {hiddenProjects.map((p) => (
            <div className="mobile-settings-hidden-row" key={p.projectId}>
              <div className="mobile-settings-hidden-info">
                <Link to={`/m/projects/${p.projectId}`} className="mobile-settings-hidden-name">
                  {p.name}
                </Link>
                {p.hiddenAt && (
                  <span className="mobile-doc-risk-meta">Hidden {formatHiddenAt(p.hiddenAt)}</span>
                )}
              </div>
              <button
                type="button"
                className="mobile-btn-secondary"
                onClick={() => unhideProject(p.projectId)}
              >
                Unhide
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="mobile-section-title" id="contact-support" ref={contactSectionRef}>
        Contact / Support
      </h2>
      <p className="mobile-screen-stub">
        Have a question or ran into a problem? Send us a message and we&rsquo;ll get back to you.
      </p>
      <MobileContactSupport />

      <h2 className="mobile-section-title">Legal</h2>
      <div className="mobile-more-list">
        <a
          href="https://confidantpm.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="mobile-more-list-item"
        >
          Privacy Policy
        </a>
      </div>

      <MobileDeleteAccount />
    </div>
  )
}

export default MobileSettings
