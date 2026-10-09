import { Link, NavLink } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ConfidantLogo from './ConfidantLogo'
import AppStoreBadges from './components/AppStoreBadges'
import { useBranding } from './branding/BrandingContext'
import { initialsFromEmail } from './initials'

const NAV_VIEWS = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦', end: true },
  { to: '/projects', label: 'All Projects', icon: '▤', end: false },
]

// The one persistent left rail, replacing the horizontal top bar every page
// used to render for itself. Three fixed zones - brand, swappable body,
// account footer - so the frame never moves between routes and only the
// middle changes:
//
//   global mode  (no `nav` passed): Dashboard / All Projects
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
  const { appName, logoUrl } = useBranding()

  return (
    <aside className="app-sidebar">
      <Link to="/dashboard" className="app-sidebar-brand">
        <span className="app-sidebar-brand-mark">
          {logoUrl ? (
            <img className="app-sidebar-brand-logo" src={logoUrl} alt="" width={28} height={28} />
          ) : (
            <ConfidantLogo size={28} />
          )}
        </span>
        <span className="app-sidebar-brand-text">
          {appName ? (
            <span className="app-sidebar-brand-name">{appName}</span>
          ) : (
            <>
              <span className="app-sidebar-brand-name">Confidant<span className="brand-name-accent">PM</span></span>
              <span className="app-sidebar-tagline">Structure the chaos. One step at a time.</span>
            </>
          )}
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

      {/* Outside .app-sidebar-body on purpose: the body is the flex-grow,
          own-scroll zone, so anything inside it scrolls away with a long
          project nav. Sitting between the body and the account footer pins
          the badges to the bottom of the rail in both nav modes. */}
      {/* ConfidantPM's own store listings: not shown under a customer's brand. */}
      {!appName && <AppStoreBadges />}

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
            Support & Settings
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
