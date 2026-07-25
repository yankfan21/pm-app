import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useDeviceMode } from './hooks/useDeviceMode'
import { resolveDeviceModeTarget } from './deviceRouteMap'

// Mounted just inside <RequireAuth/> (App.jsx), same idiom as RequireAuth
// itself - a synchronous render-time redirect check (Navigate vs Outlet, no
// useEffect+navigate) so there's no flash of the wrong mode's page before
// the redirect fires. Re-evaluates on every render, which covers all three
// trigger cases: initial mount (fresh viewport check), a live viewport
// resize (useDeviceMode's matchMedia listener), and an explicit override
// (always paired with its own navigate() call elsewhere, which changes
// location and re-renders this).
function DeviceModeGate() {
  const location = useLocation()
  const { mode } = useDeviceMode()

  const target = resolveDeviceModeTarget(mode, location.pathname)
  if (target) {
    return <Navigate to={target} replace />
  }

  return <Outlet />
}

export default DeviceModeGate
