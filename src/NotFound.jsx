import { Link } from 'react-router-dom'
import AppHeader from './AppHeader'

function NotFound() {
  return (
    <div className="app">
      <AppHeader />
      <p className="charter-status">Page not found.</p>
      <Link to="/" className="btn-secondary back-link">
        &larr; Back to Dashboard
      </Link>
    </div>
  )
}

export default NotFound
