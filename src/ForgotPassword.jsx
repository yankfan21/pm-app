import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import ConfidantLogo from './ConfidantLogo'

const PREVIEW_STEP = 3
const PREVIEW_TOTAL = 12
const PREVIEW_DOTS = 5

// Deliberately identical whether or not the address has an account - see
// handleSubmit below.
const SENT_MESSAGE =
  'If an account exists for that address, a password reset link is on its way. Check your inbox (and spam folder).'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  // Same reasoning as Login.jsx - this is a full-bleed pre-auth screen, so
  // drop the centered/width-capped #root constraint while mounted.
  useEffect(() => {
    document.body.classList.add('login-route')
    return () => document.body.classList.remove('login-route')
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)

    // Account-enumeration guard: a "no such user" result must be
    // indistinguishable from a successful send, so every outcome lands on
    // the same confirmation copy. The one exception is rate limiting (429) -
    // that says nothing about whether the address exists, and silently
    // showing "check your email" when no email was sent would strand the
    // user waiting for a message that never arrives.
    if (error && error.status === 429) {
      setError('Too many reset requests. Wait a few minutes and try again.')
      return
    }

    setSent(true)
  }

  return (
    <div className="login-page">
      <div className="login-panel login-panel-form">
        <div className="login-panel-form-inner">
          <div className="login-brand">
            <ConfidantLogo size={40} />
            <span className="login-brand-name">ConfidantPM</span>
            <p className="login-brand-tagline">Structure the chaos. One step at a time.</p>
          </div>

          <h1 className="login-heading">Reset your password</h1>

          {sent ? (
            <>
              <p className="login-subtext">{SENT_MESSAGE}</p>
              <p className="login-footer-link">
                <Link to="/login">Back to sign in</Link>
              </p>
            </>
          ) : (
            <>
              <p className="login-subtext">
                Enter your email and we&apos;ll send you a link to set a new password.
              </p>

              <form className="login-form-v2" onSubmit={handleSubmit}>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </label>

                {error && <p className="login-error">{error}</p>}

                <button type="submit" className="login-btn-primary" disabled={submitting}>
                  {submitting ? 'Please wait...' : 'Send reset link'}
                </button>
              </form>

              <p className="login-footer-link">
                Remembered it? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="login-panel login-panel-preview">
        <div className="login-preview-content">
          <div className="login-preview-steps">
            <div className="login-preview-dots">
              {Array.from({ length: PREVIEW_DOTS }, (_, i) => (
                <span key={i} className={`login-preview-dot ${i < PREVIEW_STEP ? 'filled' : ''}`} />
              ))}
            </div>
            <span className="login-preview-counter">
              {String(PREVIEW_STEP).padStart(2, '0')} / {PREVIEW_TOTAL}
            </span>
          </div>
          <p className="login-preview-label">Recognition and scoping</p>
          <p className="login-preview-question">What is the primary milestone for Phase 1 delivery?</p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
