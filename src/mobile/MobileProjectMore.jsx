import { Link, useParams } from 'react-router-dom'

// Project-scoped overflow (/m/projects/:projectId/more) - houses the
// sections that don't fit the 5-slot tab bar: read-only Documents, quick
// risk flag, Status Update Q&A, and read-only Exec Comms/Newsletter views
// (separate entries - generation stays desktop-only).
function MobileProjectMore() {
  const { projectId } = useParams()
  const base = `/m/projects/${projectId}`

  const items = [
    { to: `${base}/more/documents`, label: 'Documents' },
    { to: `${base}/more/risks`, label: 'Flag a Risk' },
    { to: `${base}/more/status-update`, label: 'Status Update' },
    { to: `${base}/more/exec-comms`, label: 'Exec Comms' },
    { to: `${base}/more/newsletter`, label: 'Newsletter' },
    { to: '/m/dashboard', label: 'Projects Dashboard' },
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
