import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

// Wraps every route that needs a signed-in user. Unauthenticated visitors
// get bounced to /login with the page they were headed to stashed in
// location state, so Login can send them back after they sign in.
function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default RequireAuth
