import { Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

// The public front door at "/" - the only route in the app that renders
// real content with no session. Deliberately mounted outside both
// RequireAuth and DeviceModeGate (see App.jsx), the same way
// /forgot-password and /reset-password are: there is no session to guard,
// and it has to render at any viewport width rather than bouncing a
// phone-width visitor into the app's mobile tree at /m/dashboard.
//
// Placeholder content for now - styling and real copy land in a follow-up.
function Marketing() {
  // Native builds (Capacitor - see capacitor.config.json, webDir: dist)
  // ship this same bundle and boot at "/", so without this they would open
  // on the marketing page instead of the app. Send them into the authed
  // tree and let RequireAuth do what it already does: an unauthenticated
  // user gets bounced to /login with /dashboard stashed as `from` (so
  // signing in lands them back here), and a signed-in user goes straight
  // through. Redirecting to /login unconditionally instead would show the
  // sign-in form to an already-signed-in user, since Login.jsx has no
  // has-session guard of its own.
  if (Capacitor.isNativePlatform()) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="marketing-page">
      <h1>ConfidantPM</h1>
    </div>
  )
}

export default Marketing
