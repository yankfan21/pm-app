import { useEffect, useRef, useState } from 'react'

// How many times a given hint is shown before it retires for good.
const MAX_SHOWS = 3

// A one-line, self-retiring nudge pointing at what desktop does that mobile
// deliberately doesn't. Shown on the first MAX_SHOWS visits to a screen and
// never again.
//
// Shared by MobileProjectMetrics.jsx (Overview), MobileProjectDocuments.jsx,
// MobileDashboard.jsx (Home), and MobileMore.jsx (More) rather than copied
// into each: the counter logic is
// identical and the only thing that differs per screen is the copy and the
// storage key. Each mount point passes its OWN storageKey, so the hints
// fade independently - reading Overview three times doesn't burn the
// Documents hint, and so on for the rest.
//
// The counter is global rather than per-project on purpose: the hint is
// about the product (mobile vs desktop), not about any one project, so
// seeing it three times total is the point. It's also localStorage rather
// than sessionStorage - it has to survive app restarts, otherwise "3 visits"
// resets every cold launch and the hint never actually retires.
//
// Runs in the native app and on /m/ mobile web alike; nothing here is
// Capacitor-specific.
function MobileScreenHint({ storageKey, children }) {
  const [visible, setVisible] = useState(false)
  // Guards against a second increment from React 19 StrictMode's
  // setup/cleanup/setup effect replay in dev, which would otherwise burn two
  // of the three showings on a single visit. Refs survive that replay (it
  // reuses the same component instance); state and the storage read do not.
  const counted = useRef(false)

  useEffect(() => {
    if (counted.current) return
    counted.current = true

    let count = 0
    try {
      count = Number(window.localStorage.getItem(storageKey)) || 0
    } catch {
      // Storage unavailable (Safari private mode, blocked cookies). Treat as
      // a fresh count and show the hint; worst case it never retires.
    }

    if (count >= MAX_SHOWS) return

    setVisible(true)
    try {
      window.localStorage.setItem(storageKey, String(count + 1))
    } catch {
      // Same as above - showing the hint matters more than recording it.
    }
  }, [storageKey])

  if (!visible) return null

  return <p className="mobile-screen-hint">{children}</p>
}

export default MobileScreenHint
