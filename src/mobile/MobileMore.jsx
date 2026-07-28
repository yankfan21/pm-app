import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

// Root-level overflow (/m/more) - account-level actions only. Project-scoped
// overflow (Documents/Risks/Status Update/Comms) lives at
// /m/projects/:projectId/more via MobileProjectMore.jsx instead, since those
// only make sense inside a project.
function MobileMore() {
  const { user, signOut } = useAuth()

  return (
    <div>
      <h1 className="mobile-screen-title">More</h1>
      <div className="mobile-more-list">
        <span className="mobile-screen-stub">{user?.email}</span>
        <Link to="/m/settings" className="mobile-more-list-item">
          Settings
        </Link>
        <Link to="/m/settings#contact-support" className="mobile-more-list-item">
          Contact Support
        </Link>
        <button type="button" className="mobile-more-list-item" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

export default MobileMore
