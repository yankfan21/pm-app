import { useState } from 'react'
import { useAuth } from './AuthContext'
import { useContactSubmit, CONTACT_REASONS } from './hooks/useContactSubmit'

// Rendered inline as a section of Settings.jsx (id="contact-support", same anchor
// AppHeader.jsx's account-menu link scrolls to) - not a modal, not its own route.
// Mobile equivalent is MobileContactSupport.jsx, sharing only useContactSubmit.
function ContactSupportForm() {
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
    return <p className="charter-status">Thanks - your message has been sent to our team.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="contact-support-form">
      <label>
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>

      <label>
        Contact Reason
        <select value={contactReason} onChange={(e) => setContactReason(e.target.value)} required>
          {/* Not disabled - disabled <option> rows ignore author CSS in most
              browsers and render with forced native gray, regardless of
              --option-pending-bg/text. formValid below (contactReason !== '')
              is what actually blocks submission with this still selected. */}
          <option value="">Select a reason</option>
          {CONTACT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </label>

      <label>
        Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} required />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="modal-actions">
        <button type="submit" className="btn-primary" disabled={!formValid || submitting}>
          {submitting ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  )
}

export default ContactSupportForm
