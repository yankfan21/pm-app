import { useLocation, useNavigate } from 'react-router-dom'
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
function MobileDesktopLink() {
  const { setOverride } = useDeviceMode()
  const location = useLocation()
  const navigate = useNavigate()

  function handleClick() {
    setOverride('desktop')
    navigate(resolveDeviceModeTarget('desktop', location.pathname) || DESKTOP_HOME)
  }

  return (
    <button type="button" className="mobile-desktop-link" onClick={handleClick}>
      View desktop site
    </button>
  )
}

export default MobileDesktopLink
