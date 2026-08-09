import { Link, NavLink } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ConfidantLogo from './ConfidantLogo'

const NAV_VIEWS = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/projects', label: 'All Projects', icon: '▤', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙', end: false },
]

// Initials for the sidebar avatar. Moved here verbatim from the old
// AppHeader.jsx (deleted - the top bar it owned is now this rail). The
// Supabase auth user is the only identity this app has - there is no profile
// row, no display-name field, nothing in user_metadata - so the email local
// part is the only thing available to derive from. Split it on the separators
// people actually put between first and last name (. _ - +) and take one
// letter from each of the first two pieces; a local part with no separator has
// no detectable name boundary ("scottsilvers" could be anything), so it falls
// back to its first two characters. Always returns something for a non-empty
// email, so the avatar never renders blank.
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

// The one persistent left rail, replacing the horizontal top bar every page
// used to render for itself. Three fixed zones - brand, swappable body,
// account footer - so the frame never moves between routes and only the
// middle changes:
//
//   global mode  (no `nav` passed): Dashboard / All Projects / Settings
//   project mode (`nav` passed):    ProjectNav + ProjectAdmin, handed in by
//                                   ProjectDetailLayout
//
// Project mode deliberately keeps the brand and the account footer rather
// than swapping the whole rail: Sign out and Contact Support were reachable
// from inside a project before this change and have to stay that way, and
// the brand doubles as the route back to the Dashboard. The way back to the
// project list is ProjectDetailLayout's own back link, left untouched.
//
// `nav` is a plain node rather than this component reaching for project data
// itself - project state (and ProjectAdmin's isOwner/canEdit/archiving) stays
// owned by ProjectDetailLayout exactly as before, this is only a new
// container for it.
function AppSidebar({ nav }) {
  const { user, signOut } = useAuth()

  return (
    <aside className="app-sidebar">
      <Link to="/" className="app-sidebar-brand">
        <span className="app-sidebar-brand-mark">
          <ConfidantLogo size={28} />
        </span>
        <span className="app-sidebar-brand-text">
          <span className="app-sidebar-brand-name">ConfidantPM</span>
          <span className="app-sidebar-tagline">Structure the chaos. One step at a time.</span>
        </span>
      </Link>

      <div className="app-sidebar-body">
        {nav ??
          (user && (
            <nav className="app-sidebar-nav" aria-label="Main">
              {NAV_VIEWS.map(({ to, label, icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `app-sidebar-nav-item ${isActive ? 'selected' : ''}`
                  }
                >
                  <span className="app-sidebar-nav-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          ))}
      </div>

      {user ? (
        <div className="account-menu">
          {/* The email itself lives on title/aria-label rather than being
              shown - it was the only thing on screen confirming which account
              you're signed in as, so it stays reachable on hover and to a
              screen reader. aria-hidden on the letters keeps the initials
              from being read out as their own separate string. */}
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
    </aside>
  )
}

// Page frame for every authenticated desktop route: the rail plus the
// scrolling content column beside it. Every page that used to hand-roll
// `<div className="app"><AppHeader/>...` renders this instead, so the rail is
// one component with one set of call sites rather than seven copies of the
// same chrome.
//
// `nav` passes straight through to AppSidebar - omit it for global mode.
// ProjectDetailPage's loading and error states deliberately omit it too:
// there's no project loaded to build a project nav from at that point, and a
// global-mode rail beats the rail vanishing and re-appearing.
function AppShell({ nav, children }) {
  return (
    <div className="app-shell">
      <AppSidebar nav={nav} />
      <div className="app">{children}</div>
    </div>
  )
}

export default AppShell
