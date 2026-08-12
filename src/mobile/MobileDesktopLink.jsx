import { useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useDeviceMode } from '../hooks/useDeviceMode'
import { resolveDeviceModeTarget, DESKTOP_HOME } from '../deviceRouteMap'

// Low-prominence manual override, shown at the bottom of every mobile
// screen. Rendered from two separate mount points (MobileShell.jsx for
// root-level screens, MobileProjectLayout.jsx for project-scoped ones) -
// there's no single shared mobile shell to add it to once (see Part 1
// investigation). Session-only (sessionStorage via useDeviceMode) - resets
// to fresh auto-detection next session. Desktop gets no reciprocal icon
// here (AppHeader.jsx is untouched); Settings' "View Mode" control is the
// other way back.
//
// Hidden entirely in native (Capacitor) builds: there is no "desktop site"
// to switch to inside the app shell - the desktop tree would just render at
// phone width with no way back to a browser - and App Store review reads an
// in-app link out to the web version as a dead end. Mobile web at /m/ in a
// browser still gets it. The check sits after the hooks rather than at the
// top of the component (the way Marketing.jsx does it) because those hooks
// run unconditionally above it; isNativePlatform() is constant for the life
// of the runtime, so the branch never flips between renders either way.
function MobileDesktopLink() {
  const { setOverride } = useDeviceMode()
  const location = useLocation()
  const navigate = useNavigate()

  function handleClick() {
    setOverride('desktop')
    navigate(resolveDeviceModeTarget('desktop', location.pathname) || DESKTOP_HOME)
  }

  if (Capacitor.isNativePlatform()) return null

  return (
    <button type="button" className="mobile-desktop-link" onClick={handleClick}>
      View desktop site
    </button>
  )
}

export default MobileDesktopLink
