import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import ProjistLogo from './ProjistLogo'

const PREVIEW_STEP = 3
const PREVIEW_TOTAL = 12
const PREVIEW_DOTS = 5

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('sign-in') // 'sign-in' | 'sign-up'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const redirectTo = location.state?.from?.pathname || '/'

  // The rest of the app renders inside a centered, width-capped, bordered
  // #root (see index.css) - this is the one screen meant to bleed full
  // width edge-to-edge per the brand design, so drop that constraint only
  // while this page is mounted.
  useEffect(() => {
    document.body.classList.add('login-route')
    return () => document.body.classList.remove('login-route')
  }, [])

  function switchMode(nextMode) {
    setMode(nextMode)
    setError(null)
    setInfo(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setSubmitting(false)
      if (error) {
        setError(error.message)
        return
      }
      navigate(redirectTo, { replace: true })
      return
    }

    if (password !== confirmPassword) {
      setSubmitting(false)
      setError('Passwords do not match.')
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo('Check your email to confirm your account, then sign in.')
    setMode('sign-in')
  }

  async function handleGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="login-page">
      <div className="login-panel login-panel-form">
        <div className="login-panel-form-inner">
          <div className="login-brand">
            <ProjistLogo size={40} />
            <span className="login-brand-name">Projist</span>
          </div>

          <h1 className="login-heading">{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="login-subtext">
            {mode === 'sign-in'
              ? 'Sign in to keep your projects moving.'
              : 'Start structuring your next project in minutes.'}
          </p>

          <form className="login-form-v2" onSubmit={handleSubmit}>
            {mode === 'sign-up' && (
              <label>
                Full name
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={mode === 'sign-in'}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            {mode === 'sign-up' && (
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
            )}

            {error && <p className="login-error">{error}</p>}
            {info && <p className="login-info">{info}</p>}

            <button type="submit" className="login-btn-primary" disabled={submitting}>
              {submitting ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="login-divider">or</div>

          <button type="button" className="login-btn-secondary" onClick={handleGoogle}>
            Continue with Google
          </button>

          <p className="login-footer-link">
            {mode === 'sign-in' ? (
              <>
                New to Projist?{' '}
                <button type="button" onClick={() => switchMode('sign-up')}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('sign-in')}>
                  Sign in
                </button>
              </>
            )}
          </p>
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
        <p className="login-preview-tagline">Structure the chaos. One step at a time.</p>
      </div>
    </div>
  )
}

export default Login
