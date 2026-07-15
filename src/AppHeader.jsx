import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'

// Rendered from three separate call sites (ProjectsShell, ProjectDetailPage,
// ProjectDetail) with no props, so the account menu lives here rather than
// in each caller - it shows up everywhere for free.
//
// debugRole (optional, temporary): 'owner' | 'editor' | 'viewer' for the
// current project, passed only from ProjectDetail - see the debug label
// below. Remove this prop along with the label once the iPad session/role
// investigation is done.
function AppHeader({ debugRole } = {}) {
  const { user, signOut } = useAuth()

  return (
    <div className="app-header-row">
      <div>
        <h1 className="app-title">
          <Link to="/" className="app-title-link">
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
          </Link>
        </h1>
        <p className="app-subtitle">Your Project Management Assistant</p>
      </div>

      {user ? (
        <div className="account-menu">
          <span className="account-menu-email">{user.email}</span>
          <button type="button" className="btn-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="account-menu">
          <Link to="/login" className="btn-secondary">
            Sign In
          </Link>
        </div>
      )}

      {/* Temporary: compare build id + auth session/role across devices
          while diagnosing the iPad stale-doc-status bug - remove both this
          and the debugRole prop/plumbing once resolved. */}
      <span
        style={{
          position: 'fixed',
          bottom: 4,
          right: 6,
          fontSize: 10,
          opacity: 0.4,
          pointerEvents: 'none',
          textAlign: 'right',
          lineHeight: 1.4,
        }}
      >
        build {__BUILD_SHA__}
        <br />
        uid: {user?.id ?? 'no session'}
        {debugRole ? (
          <>
            <br />
            role: {debugRole}
          </>
        ) : null}
      </span>
    </div>
  )
}

export default AppHeader
