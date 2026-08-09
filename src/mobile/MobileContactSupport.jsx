import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { useContactSubmit, CONTACT_REASONS } from '../hooks/useContactSubmit'

// Rendered inline as a section of MobileSettings.jsx (id="contact-support",
// same anchor MobileMore.jsx's list item scrolls to). Mirrors ContactSupportForm.jsx's
// fields/logic (shared via useContactSubmit) with mobile-* markup instead of desktop's.
function MobileContactSupport() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [contactReason, setContactReason] = useState('')
  const [message, setMessage] = useState('')
  const { submit, submitting, error, submitted } = useContactSubmit()

  const formValid = name.trim() !== '' && email.trim() !== '' && contactReason !== '' && message.trim() !== ''

  function handleSubmit(e) {
    e.preventDefault()
    if (!formValid || submitting) return
    submit({ name, email, contactReason, message })
  }

  if (submitted) {
    return <p className="mobile-screen-stub">Thanks - your message has been sent to our team.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mobile-risk-form">
      <label className="mobile-select-field">
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label className="mobile-select-field">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>

      <label className="mobile-select-field">
        Contact Reason
        <select value={contactReason} onChange={(e) => setContactReason(e.target.value)} required>
          <option value="" disabled>
            Select a reason
          </option>
          {CONTACT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </label>

      <label className="mobile-select-field">
        Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} required />
      </label>

      {error && <p className="mobile-error">{error}</p>}

      <button type="submit" disabled={!formValid || submitting}>
        {submitting ? 'Sending...' : 'Send'}
      </button>
    </form>
  )
}

export default MobileContactSupport
