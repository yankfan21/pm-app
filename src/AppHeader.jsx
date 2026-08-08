import { Link, NavLink } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ConfidantLogo from './ConfidantLogo'

const NAV_VIEWS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'All Projects', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

// Initials for the header avatar. The Supabase auth user is the only identity
// this app has - there is no profile row, no display-name field, nothing in
// user_metadata - so the email local part is the only thing available to
// derive from. Split it on the separators people actually put between first
// and last name (. _ - +) and take one letter from each of the first two
// pieces; a local part with no separator has no detectable name boundary
// ("scottsilvers" could be anything), so it falls back to its first two
// characters. Always returns something for a non-empty email, so the avatar
// never renders blank.
function initialsFromEmail(email) {
  const localPart = (email || '').split('@')[0]
  const parts = localPart.split(/[.\-_+]+/).filter(Boolean)

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return '?'
}

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
            {/* The email itself moves into title/aria-label rather than being
                dropped - it was the only thing on screen confirming which
                account you're signed in as, so it stays reachable on hover
                and to a screen reader. aria-hidden on the letters keeps the
                initials from being read out as their own separate string. */}
            <span
              className="account-menu-avatar"
              title={user.email}
              aria-label={`Signed in as ${user.email}`}
            >
              <span aria-hidden="true">{initialsFromEmail(user.email)}</span>
            </span>
            <Link to="/settings#contact-support" className="btn-secondary">
              Contact Support
            </Link>
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
