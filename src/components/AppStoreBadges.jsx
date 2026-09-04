import { Capacitor } from '@capacitor/core'
import appStoreBadge from '../assets/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg'
import googlePlayBadge from '../assets/badges/googleplay-badge-01-getit.width-1440.png'

// App Store / Google Play badges. Four mount points, two trees:
//
//   Desktop  AppShell.jsx (foot of the rail), Marketing.jsx (closing section)
//   Phone    MobileShell.jsx and MobileProjectLayout.jsx - the two /m/
//            layouts, directly below "View desktop site"
//
// One component rather than four copies so the styling and store links stay
// in one place. Sizing is per-tree, not here: App.css owns the desktop
// dimensions, mobile.css scales them down for phone width.
//
// Apple is live (id6800421213) and links out; Google is still Closed Testing
// Alpha, so it stays a plain, muted, non-clickable <img> until it's publicly
// installable - flip it to a link the same way Apple is done below.
//
// Hidden in native (Capacitor) builds only - a user already inside the
// installed app has no use for a "get the app" badge. Same early-return idiom
// as MobileDesktopLink.jsx. Web is web: mobile web at /m/ in a browser is
// exactly the audience for these, which is why there is no /m/ path guard.
function AppStoreBadges() {
  if (Capacitor.isNativePlatform()) return null

  return (
    <div className="app-store-badges">
      <span className="app-store-badges-label">Take ConfidantPM anywhere.</span>
      <div className="app-store-badges-row">
        <div className="app-store-badge-col">
          <span className="app-store-badge-status app-store-badge-status-live">
            Now available
          </span>
          {/* Alt text describes the destination rather than the artwork -
              these are recognisable store marks, and "Download on the App
              Store" is the badge's own wording. */}
          <a
            href="https://apps.apple.com/app/confidantpm/id6800421213"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              className="app-store-badge app-store-badge-apple"
              src={appStoreBadge}
              alt="Download on the App Store"
            />
          </a>
        </div>
        {/* Per-badge class rather than one shared size: the two source files
            carry very different amounts of built-in padding, so equal
            rendered heights do NOT mean equal visual size. See App.css. */}
        <div className="app-store-badge-col">
          <span className="app-store-badge-status app-store-badge-status-soon">
            Coming soon
          </span>
          <img
            className="app-store-badge app-store-badge-google app-store-badge-muted"
            src={googlePlayBadge}
            alt="Get it on Google Play"
            title="Coming to Google Play soon"
          />
        </div>
      </div>
    </div>
  )
}

export default AppStoreBadges
