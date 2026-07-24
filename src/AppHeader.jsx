import { Link, NavLink } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ConfidantLogo from './ConfidantLogo'

const NAV_VIEWS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'All Projects', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

// Rendered from three separate call sites (ProjectsShell, ProjectDetailPage,
// ProjectDetail) with no props, so the nav + account menu live here rather
// than in each caller - they show up everywhere for free, and every page
// shares one consistent header frame.
function AppHeader() {
  const { user, signOut } = useAuth()

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-left">
          <Link to="/" className="app-header-brand">
            <span className="app-header-brand-mark">
              <ConfidantLogo size={28} />
            </span>
            <span className="app-header-brand-text">
              <span className="app-header-brand-name">ConfidantPM</span>
              <span className="app-header-tagline">Structure the chaos. One step at a time.</span>
            </span>
          </Link>

          {user && (
            <nav className="app-nav">
              {NAV_VIEWS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => (isActive ? 'selected' : '')}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
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
      </div>
    </header>
  )
}

export default AppHeader
