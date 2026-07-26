import { Link, useParams } from 'react-router-dom'

// Project-scoped overflow (/m/projects/:projectId/more) - houses the
// sections that don't fit the tab bar: read-only Documents, Status Update
// Q&A, and read-only Exec Comms/Newsletter views (separate entries -
// generation stays desktop-only). Issues and Risks moved out to their own
// tab-bar tabs (MobileProjectTabBar.jsx) - their routes still live under
// more/issues and more/risks, just no longer linked from this list.
function MobileProjectMore() {
  const { projectId } = useParams()
  const base = `/m/projects/${projectId}`

  const items = [
    { to: `${base}/more/documents`, label: 'Documents' },
    { to: `${base}/more/status-update`, label: 'Status Update' },
    { to: `${base}/more/exec-comms`, label: 'Exec Comms' },
    { to: `${base}/more/newsletter`, label: 'Newsletter' },
    { to: '/m/dashboard', label: 'Projects Dashboard' },
    { to: '/m/settings', label: 'Settings' },
  ]

  return (
    <div>
      <h1 className="mobile-screen-title">More</h1>
      <div className="mobile-more-list">
        {items.map(({ to, label }) => (
          <Link key={to} to={to} className="mobile-more-list-item">
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default MobileProjectMore
