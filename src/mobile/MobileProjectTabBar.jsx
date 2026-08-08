import { NavLink } from 'react-router-dom'
import { visibleSides } from '../projectSections'

// Project-scoped tab bar - fully replaces MobileGlobalTabBar while inside a
// project. "Tasks" is hidden for pure Agile projects and "Board" is hidden
// for pure Waterfall projects, reusing the same visibleSides() gate the
// desktop nav uses (projectSections.js is shared config/logic, not a
// desktop UI component - see ProjectNav.jsx for the desktop consumer of the
// same function). Documents/Issues/Risks are fixed tabs for every
// methodology. All three keep their existing more/* URLs rather than being
// re-rooted - those routes (App.jsx) already render standalone, and
// deviceRouteMap.js's mobile<->desktop pairs stay valid untouched.
// Documents is also still listed in MobileProjectMore.jsx - the tab is an
// additional entry point, not a move.
function MobileProjectTabBar({ projectId, methodology }) {
  const base = `/m/projects/${projectId}`
  const sides = visibleSides(methodology)
  const showTasks = sides.waterfall
  const showBoard = sides.agile

  const tabs = [
    { to: base, label: 'Overview', icon: '◈', end: true },
    showTasks && { to: `${base}/tasks`, label: 'Tasks', icon: '☑' },
    showBoard && { to: `${base}/sprint-board`, label: 'Board', icon: '▤' },
    { to: `${base}/more/documents`, label: 'Documents', icon: '▦' },
    { to: `${base}/more/issues`, label: 'Issues', icon: '❗' },
    { to: `${base}/more/risks`, label: 'Risks', icon: '⚠' },
    { to: `${base}/more`, label: 'More', icon: '≡' },
  ].filter(Boolean)

  return (
    <nav className="mobile-tabbar">
      {tabs.map(({ to, label, icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
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

export default MobileProjectTabBar
