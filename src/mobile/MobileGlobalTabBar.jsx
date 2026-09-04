import { NavLink } from 'react-router-dom'

// Root-level tab bar for /m/dashboard, /m/more - replaced entirely by
// MobileProjectTabBar once the user is inside a project
// (/m/projects/:projectId/...). Never rendered alongside it.
const GLOBAL_TABS = [
  { to: '/m/dashboard', label: 'Home', icon: '◈' },
  { to: '/m/more', label: 'More', icon: '≡' },
]

function MobileGlobalTabBar() {
  return (
    <nav className="mobile-tabbar">
      {GLOBAL_TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `mobile-tabbar-item ${isActive ? 'selected' : ''}`}
        >
          <span className="mobile-tabbar-item-icon" aria-hidden="true">
            {icon}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default MobileGlobalTabBar
