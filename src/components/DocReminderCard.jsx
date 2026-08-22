import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Shorter reappear window than MobileAppTeaserCard's 30 days - this points at
// something the PM hasn't done yet rather than a permanent cross-sell, so
// nagging again sooner is the right call.
const DISMISS_DAYS = 7
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

// Same fail-open dismiss/reappear read as MobileAppTeaserCard.jsx - storage
// unavailable, key absent, garbage value, or a clock-skewed future timestamp
// all fall through to "show it". Showing the card matters more than honoring
// a dismissal we can't read.
function shouldShow(storageKey) {
  let dismissedAt = 0
  try {
    dismissedAt = Number(window.localStorage.getItem(storageKey)) || 0
  } catch {
    return true
  }

  if (!dismissedAt) return true
  return Date.now() - dismissedAt > DISMISS_MS
}

// Dismissible Overview card nudging the PM toward an AI doc flow they haven't
// started yet (Charter, Risk Log). Dismissal only ever hides it temporarily -
// the caller is responsible for the permanent off-switch by only rendering
// this while the underlying doc row genuinely doesn't exist yet.
function DocReminderCard({ storageKey, heading, body, ctaLabel, ctaTo }) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(() => shouldShow(storageKey))

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(storageKey, String(Date.now()))
    } catch {
      // Storage unavailable - the card is gone for this page view, and comes
      // back on the next load. Better than blocking the dismiss.
    }
  }

  if (!visible) return null

  return (
    <div className="doc-reminder-card">
      <button
        type="button"
        className="doc-reminder-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        &times;
      </button>
      <h3 className="doc-reminder-heading">{heading}</h3>
      <p className="doc-reminder-body">{body}</p>
      <button type="button" className="btn-primary" onClick={() => navigate(ctaTo)}>
        {ctaLabel}
      </button>
    </div>
  )
}

export default DocReminderCard
