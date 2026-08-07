import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import ConfidantLogo from './ConfidantLogo'

const PREVIEW_STEP = 3
const PREVIEW_TOTAL = 12
const PREVIEW_DOTS = 5

// How long to wait for a recovery session before calling the link dead. The
// client parses the URL fragment asynchronously on init (detectSessionInUrl
// is on by default - see supabaseClient.js), so a session that isn't there
// on first render may still arrive a tick later; anything past this is a
// link that carried no usable token.
const RECOVERY_TIMEOUT_MS = 5000
const REDIRECT_DELAY_MS = 2500

// Supabase reports a dead link by appending error params to the redirect
// URL's fragment (e.g. #error=access_denied&error_code=otp_expired) rather
// than by failing silently, so read those up front instead of sitting
// through the timeout above.
function readFragmentError() {
  const hash = window.location.hash
  if (!hash || hash.length < 2) return null
  const params = new URLSearchParams(hash.slice(1))
  if (!params.get('error') && !params.get('error_code')) return null
  if (params.get('error_code') === 'otp_expired') {
    return 'That reset link has expired. Request a new one below.'
  }
  return params.get('error_description') || 'That reset link is no longer valid.'
}

function ResetPassword() {
  const navigate = useNavigate()
  // 'checking' -> waiting on the recovery session
  // 'ready'    -> recovery session confirmed, show the form
  // 'invalid'  -> no usable recovery session (expired/tampered/direct hit)
  // 'done'     -> password changed, redirecting to /login
  const [status, setStatus] = useState('checking')
  const [invalidReason, setInvalidReason] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const redirectTimer = useRef(null)

  // Same reasoning as Login.jsx - full-bleed pre-auth screen, so drop the
  // centered/width-capped #root constraint while mounted.
  useEffect(() => {
    document.body.classList.add('login-route')
    return () => document.body.classList.remove('login-route')
  }, [])

  useEffect(() => {
    const fragmentError = readFragmentError()
    if (fragmentError) {
      setInvalidReason(fragmentError)
      setStatus('invalid')
      return undefined
    }

    // Subscribe before the getSession() check below: onAuthStateChange
    // fires INITIAL_SESSION immediately on subscribe, so if the fragment
    // was already consumed (client init runs at module import, before this
    // component ever mounts) the session still gets picked up here rather
    // than being missed between the two calls.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        // Only ever advance out of 'checking' - a later SIGNED_OUT (fired by
        // the sign-out in handleSubmit) must not drag a finished flow back.
        setStatus((current) => (current === 'checking' ? 'ready' : current))
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus((current) => (current === 'checking' ? 'ready' : current))
      }
    })

    const timer = setTimeout(() => {
      setStatus((current) => {
        if (current !== 'checking') return current
        setInvalidReason('This password reset link is invalid or has expired.')
        return 'invalid'
      })
    }, RECOVERY_TIMEOUT_MS)

    return () => {
      clearTimeout(timer)
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }

    setStatus('done')
    // End the recovery session so the new password actually gets used - the
    // recovery link left the user signed in, and landing them on /login
    // still authenticated would let them skip straight back into the app
    // without ever typing it.
    await supabase.auth.signOut()
    redirectTimer.current = setTimeout(() => {
      navigate('/login', { replace: true })
    }, REDIRECT_DELAY_MS)
  }

  function renderBody() {
    if (status === 'checking') {
      return (
        <>
          <h1 className="login-heading">Checking your link</h1>
          <p className="login-subtext">One moment...</p>
        </>
      )
    }

    if (status === 'invalid') {
      return (
        <>
          <h1 className="login-heading">Link not valid</h1>
          <p className="login-subtext">{invalidReason}</p>
          <p className="login-footer-link">
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        </>
      )
    }

    if (status === 'done') {
      return (
        <>
          <h1 className="login-heading">Password updated</h1>
          <p className="login-subtext">
            Your password has been changed. Taking you to sign in...
          </p>
          <p className="login-footer-link">
            <Link to="/login">Sign in now</Link>
          </p>
        </>
      )
    }

    return (
      <>
        <h1 className="login-heading">Set a new password</h1>
        <p className="login-subtext">Choose a new password for your account.</p>

        <form className="login-form-v2" onSubmit={handleSubmit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn-primary" disabled={submitting}>
            {submitting ? 'Please wait...' : 'Update password'}
          </button>
        </form>

        <p className="login-footer-link">
          <Link to="/login">Back to sign in</Link>
        </p>
      </>
    )
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

          {renderBody()}
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

export default ResetPassword
