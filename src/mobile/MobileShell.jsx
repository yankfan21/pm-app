import { Outlet } from 'react-router-dom'
import ConfidantLogo from '../ConfidantLogo'
import MobileGlobalTabBar from './MobileGlobalTabBar'
import MobileDesktopLink from './MobileDesktopLink'
import './mobile.css'

// Root layout for every /m/* route outside a project (dashboard,
// notifications, more). Purpose-built for phone mode - does not reuse
// ProjectsShell/AppHeader from the desktop route tree, so desktop chrome
// changes can't regress this and vice versa.
function MobileShell() {
  return (
    <div className="mobile-app">
      <div className="mobile-app-body mobile-app-body--root">
        {/* Icon-only brand mark - the one piece of top chrome root screens
            have. Rendered here once rather than per-screen so Home,
            Notifications, More and Settings all get it. Sits inside the body
            rather than as a sibling above it so it reuses
            .mobile-app-body--root's safe-area padding instead of re-applying
            the inset (which would then pad twice). */}
        <div className="mobile-brand-row">
          <ConfidantLogo size={24} />
        </div>
        <Outlet />
        <MobileDesktopLink />
      </div>
      <MobileGlobalTabBar />
    </div>
  )
}

export default MobileShell
