import MobileScreenHint from './MobileScreenHint'

// Phone-scoped notifications (/m/notifications). Scaffolding only.
function MobileNotifications() {
  return (
    <div>
      <h1 className="mobile-screen-title">Notifications</h1>

      <MobileScreenHint storageKey="cpm_alerts_hint_count">
        The mobile app tells you what happened. The desktop app is where you shape what happens next.
      </MobileScreenHint>

      <p className="mobile-screen-stub">Nothing here yet.</p>
    </div>
  )
}

export default MobileNotifications
