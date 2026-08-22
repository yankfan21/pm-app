import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import ConfidantLogo from './ConfidantLogo'

const PANEL_PHRASES = [
  'The assistant asks the right questions upfront.',
  'Plan every phase on a visual timeline.',
  'Track budget down to the line item.',
  'Surface risks before they become problems.',
  'Keep every task assigned, dated, and visible.',
  'Never miss a milestone.',
  'Log issues the moment they come up.',
  'Keep every project document in one place.',
  'See project health at a glance.',
  'Collaborate without losing the thread.',
]
const PANEL_PHRASE_INTERVAL_MS = 10000

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // /login?mode=signup opens straight into "create account" - that is where
  // the marketing page's "Try ConfidantPM free" CTAs point (Marketing.jsx), so a
  // visitor who clicked "sign up" is not shown a sign-in form to dismiss
  // first. Read once as lazy initial state, not synced to the URL after
  // mount: the in-page toggle below owns `mode` from then on, and re-reading
  // the param would fight it.
  const [mode, setMode] = useState(() =>
    searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in',
  ) // 'sign-in' | 'sign-up'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PANEL_PHRASES.length)
    }, PANEL_PHRASE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // Falls back to the signed-in home (/dashboard), not "/" - "/" is the
  // public marketing page now, so defaulting there would bounce a user who
  // just signed in straight back out to the front door.
  const redirectTo = location.state?.from?.pathname || '/dashboard'

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
      // Same reasoning as `redirectTo` above - window.location.origin alone
      // is "/", which would land a freshly authenticated user on the public
      // marketing page instead of the app.
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="login-page">
      <div className="login-panel login-panel-form">
        <div className="login-panel-form-inner">
          <div className="login-brand">
            <ConfidantLogo size={40} />
            <span className="login-brand-name">Confidant<span className="brand-name-accent">PM</span></span>
            <p className="login-brand-tagline">Structure the chaos. One step at a time.</p>
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
            {mode === 'sign-in' && (
              <p className="login-forgot-link">
                <Link to="/forgot-password">Forgot password?</Link>
              </p>
            )}
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
                New to ConfidantPM?{' '}
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

          <p className="login-legal-link">
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        </div>
      </div>

      <div className="login-panel login-panel-preview">
        <div className="login-preview-blobs" aria-hidden="true">
          <span className="login-preview-blob login-preview-blob-1" />
          <span className="login-preview-blob login-preview-blob-2" />
          <span className="login-preview-blob login-preview-blob-3" />
        </div>
        <div className="login-preview-content">
          <div className="login-preview-headline-frame">
            {PANEL_PHRASES.map((phrase, i) => (
              <p
                key={phrase}
                className={`login-preview-headline ${i === phraseIndex ? 'active' : ''}`}
              >
                {phrase}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
