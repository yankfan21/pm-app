import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'cpm_mobile_teaser_dismissed_at'

// How long a dismissal sticks before the card comes back. Long enough that
// dismissing feels like it worked, short enough that the message lands again
// once there's actually something to download.
const DISMISS_DAYS = 30
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

// Reads the stored dismissal and decides whether to show. Every failure mode -
// storage unavailable (Safari private mode, blocked cookies), key absent,
// garbage value, a clock-skewed future timestamp - falls through to `true`.
// Same fail-open stance as MobileScreenHint.jsx: showing the card matters more
// than honouring a dismissal we can't read.
function shouldShow() {
  let dismissedAt = 0
  try {
    dismissedAt = Number(window.localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return true
  }

  if (!dismissedAt) return true
  return Date.now() - dismissedAt > DISMISS_MS
}

// Dismissible Dashboard card pointing at the mobile app. Desktop-only, guarded
// the same way as AppStoreBadges.jsx (native early-return + /m/ path check) -
// see the longer note there for why both guards exist when DeviceModeGate
// already keeps mobile viewports off /dashboard.
//
// Unlike MobileScreenHint.jsx this reads storage in a lazy useState
// initialiser rather than an effect, and needs no StrictMode ref guard: that
// component WRITES on display (it's counting showings), so a replayed effect
// would burn a showing. This one only writes on dismiss, so a double render is
// two identical reads and nothing else.
function MobileAppTeaserCard() {
  const location = useLocation()
  const [visible, setVisible] = useState(shouldShow)

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      // Storage unavailable - the card is gone for this page view, and comes
      // back on the next load. Better than blocking the dismiss.
    }
  }

  if (Capacitor.isNativePlatform()) return null
  if (location.pathname.startsWith('/m/')) return null
  if (!visible) return null

  return (
    <div className="mobile-teaser-card">
      <button
        type="button"
        className="mobile-teaser-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        &times;
      </button>
      <h3 className="mobile-teaser-heading">Built for wherever the work happens</h3>
      <p className="mobile-teaser-body">
        Same project, same data, whichever screen is in front of you.
      </p>
    </div>
  )
}

export default MobileAppTeaserCard
