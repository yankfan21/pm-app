import { useCallback, useEffect, useState } from 'react'

const OVERRIDE_KEY = 'deviceModeOverride'
// Phone layout when the screen is narrower than 768px, or when it is a touch
// screen shorter than 500px. The second half is a phone held sideways: its
// width passes 768px (about 850-930px) but it is only 390-430px tall, and the
// desktop layout squeezed into that is a poor representation of the product.
// Touch-only, so a short desktop browser window keeps the desktop layout;
// iPads sideways (768px tall or more) stay on the desktop side too.
const MOBILE_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)'
export const availableDeviceModes = ['mobile', 'desktop']

function viewportMode() {
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop'
}

// Session-only (sessionStorage, not localStorage, per spec - expires when
// the tab/browser closes, auto-detect resumes fresh next session) manual
// override. Read fresh on every render rather than cached in React state
// (unlike useTheme.js's stored value) - this hook is called independently
// from several places (DeviceModeGate, Settings, MobileSettings), and a
// plain synchronous read means an override set by one instance is visible
// to every other instance on its next render with no cross-instance sync
// mechanism needed, since every override-setting action here is always
// paired with a navigate() call that forces the relevant instances to
// re-render anyway.
function readOverride() {
  const stored = sessionStorage.getItem(OVERRIDE_KEY)
  return availableDeviceModes.includes(stored) ? stored : null
}

// Viewport-width device mode, mirroring useTheme.js's shape - live
// matchMedia listener for the auto-detected side (here: phone vs
// tablet/desktop viewport width, there: OS light/dark preference), plus a
// manual override that wins while set. Width threshold is 768px - the same
// tablet-and-up breakpoint already established in App.css (see the
// "Tablet and up" comment above its `@media (min-width: 768px)` block) -
// which puts iPad portrait (768) and landscape (1024) on the desktop side.
// See MOBILE_QUERY for the landscape-phone case.
export function useDeviceMode() {
  const [autoMode, setAutoMode] = useState(viewportMode)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setAutoMode(mql.matches ? 'mobile' : 'desktop')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const override = readOverride()

  const setOverride = useCallback((next) => {
    if (!availableDeviceModes.includes(next)) return
    sessionStorage.setItem(OVERRIDE_KEY, next)
  }, [])

  // A phone-width screen always gets the phone layout: the desktop layout
  // squeezed to phone width is a poor representation of the product, so a
  // stored 'desktop' choice (from before the phone-side switch was removed)
  // is ignored there. 'mobile' still wins on a wide screen, which is how
  // desktop Settings previews the phone layout.
  const mode = override === 'desktop' && autoMode === 'mobile' ? 'mobile' : override || autoMode

  return { mode, autoMode, override, setOverride }
}

export default useDeviceMode
