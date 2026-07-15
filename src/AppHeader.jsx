import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ProjistLogo from './ProjistLogo'

// Rendered from three separate call sites (ProjectsShell, ProjectDetailPage,
// ProjectDetail) with no props, so the account menu lives here rather than
// in each caller - it shows up everywhere for free.
function AppHeader() {
  const { user, signOut } = useAuth()

  return (
    <div className="app-header-row">
      <div>
        <h1 className="app-title">
          <Link to="/" className="app-title-link">
            <span className="app-title-mark">
              <ProjistLogo size={24} />
            </span>
            Projist
          </Link>
        </h1>
        <p className="app-subtitle">Structure the chaos. One step at a time.</p>
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

      <span
        style={{
          position: 'fixed',
          bottom: 4,
          right: 6,
          fontSize: 10,
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      >
        build {__BUILD_SHA__}
      </span>
    </div>
  )
}

export default AppHeader
