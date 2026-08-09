import { Link } from 'react-router-dom'
import AppShell from './AppShell'

function NotFound() {
  return (
    <AppShell>
      <div className="app-body">
        <p className="charter-status">Page not found.</p>
        <Link to="/dashboard" className="btn-secondary back-link">
          &larr; Back to Dashboard
        </Link>
      </div>
    </AppShell>
  )
}

export default NotFound
