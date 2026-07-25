import { Outlet } from 'react-router-dom'
import MobileGlobalTabBar from './MobileGlobalTabBar'
import './mobile.css'

// Root layout for every /m/* route outside a project (dashboard,
// notifications, more). Purpose-built for phone mode - does not reuse
// ProjectsShell/AppHeader from the desktop route tree, so desktop chrome
// changes can't regress this and vice versa.
function MobileShell() {
  return (
    <div className="mobile-app">
      <div className="mobile-app-body">
        <Outlet />
      </div>
      <MobileGlobalTabBar />
    </div>
  )
}

export default MobileShell
