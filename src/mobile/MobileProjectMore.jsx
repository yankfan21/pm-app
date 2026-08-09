import { Link, useParams } from 'react-router-dom'

// Project-scoped overflow (/m/projects/:projectId/more) - houses the
// sections that don't fit the tab bar: read-only Documents, Status Update
// Q&A, read-only Exec Comms/Newsletter views (separate entries - generation
// stays desktop-only), plus Issues and Risks, which moved back here when
// the tab bar was trimmed from 7 tabs to 5 (see MobileProjectTabBar.jsx).
// Their routes are unchanged (more/issues, more/risks).
//
// Split into two groups rather than one flat list: everything above the
// divider acts on THIS project, everything below leaves it. They were
// previously interleaved with no separation, so "Projects Dashboard" - the
// only route back to the project list before the topbar back link (see
// MobileProjectLayout.jsx) - read as just another project section.
function MobileProjectMore() {
  const { projectId } = useParams()
  const base = `/m/projects/${projectId}`

  const projectItems = [
    { to: `${base}/more/documents`, label: 'Documents' },
    { to: `${base}/more/status-update`, label: 'Status Update' },
    { to: `${base}/more/exec-comms`, label: 'Exec Comms' },
    { to: `${base}/more/newsletter`, label: 'Newsletter' },
    { to: `${base}/more/issues`, label: 'Issues' },
    { to: `${base}/more/risks`, label: 'Risks' },
  ]

  const globalItems = [
    { to: '/m/dashboard', label: 'All Projects' },
    { to: '/m/settings', label: 'Settings' },
  ]

  return (
    <div>
      <h1 className="mobile-screen-title">More</h1>

      <div className="mobile-more-list">
        {projectItems.map(({ to, label }) => (
          <Link key={to} to={to} className="mobile-more-list-item">
            {label}
          </Link>
        ))}
      </div>

      <div className="mobile-more-group-divider" role="separator" />

      <div className="mobile-more-list">
        {globalItems.map(({ to, label }) => (
          <Link key={to} to={to} className="mobile-more-list-item">
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default MobileProjectMore
