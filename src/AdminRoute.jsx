import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ADMIN_EMAIL } from './adminConfig'

// Gates the hidden /admin route on top of RequireAuth. Non-admin users are
// signed in already, just not authorized - redirect to / rather than /login
// so nothing about an admin area is hinted at (a distinct "not authorized"
// page or a bounce to /login would both leak that something is being gated).
function AdminRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  if (user?.email !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default AdminRoute
