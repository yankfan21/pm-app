import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import appStoreBadge from '../assets/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg'
import googlePlayBadge from '../assets/badges/googleplay-badge-01-getit.width-1440.png'

// "Coming soon" App Store / Google Play badges, rendered twice: at the foot of
// the desktop rail (AppShell.jsx) and as the last section of the desktop
// Settings page (Settings.jsx). One component rather than two copies so the
// muted styling and the eventual switch to real store links happen in one
// place.
//
// Deliberately NOT links. The apps aren't published, so there is no URL to
// point at; plain <img> keeps them out of the tab order and off the "broken
// link" list until there's something real to open. When the listings go live,
// wrap each <img> in an <a> here and the two mount points inherit it.
//
// Desktop-only, guarded twice over:
//
//   1. Native (Capacitor) - a user already inside the installed app has no use
//      for a "get the app" badge. Same early-return idiom as
//      MobileDesktopLink.jsx.
//   2. Any /m/ path - the mobile tree.
//
// Both guards are belt-and-braces: DeviceModeGate.jsx already redirects mobile
// viewports off /dashboard, /settings and the rest of the desktop tree via
// deviceRouteMap.js, so neither mount point is reachable from /m/ under normal
// routing. They cover the one gap that routing doesn't - a native session with
// a manual desktop override (Settings' View Mode radio), which renders the
// desktop rail on a phone.
function AppStoreBadges() {
  const location = useLocation()

  if (Capacitor.isNativePlatform()) return null
  if (location.pathname.startsWith('/m/')) return null

  return (
    <div className="app-store-badges">
      <span className="app-store-badges-label">Coming soon</span>
      <div className="app-store-badges-row">
        {/* Alt text describes the destination rather than the artwork - these
            are recognisable store marks, and "Download on the App Store" is
            the badge's own wording. */}
        <img
          className="app-store-badge"
          src={appStoreBadge}
          alt="Download on the App Store"
        />
        <img
          className="app-store-badge"
          src={googlePlayBadge}
          alt="Get it on Google Play"
        />
      </div>
    </div>
  )
}

export default AppStoreBadges
