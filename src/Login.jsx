import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  MessageCircleQuestion,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckSquare,
  Flag,
  AlertCircle,
  FileText,
  Activity,
  Users,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { AppleSignIn } from '@capawesome/capacitor-apple-sign-in'
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
const PANEL_ICONS = [
  MessageCircleQuestion,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckSquare,
  Flag,
  AlertCircle,
  FileText,
  Activity,
  Users,
]
const PANEL_PHRASE_INTERVAL_MS = 5000
// Custom URL scheme registered in ios/App/App/Info.plist (CFBundleURLTypes)
// and android/app/src/main/AndroidManifest.xml (intent-filter) - lets Google
// OAuth hand control back to the native app instead of leaving it stranded
// in the in-app browser sheet.
const GOOGLE_OAUTH_NATIVE_REDIRECT = 'com.confidantpm.app://login-callback'

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

  // Catches the OAuth callback that Google/Supabase hand back to the native
  // app via GOOGLE_OAUTH_NATIVE_REDIRECT, once the in-app browser sheet
  // (Browser.open in handleGoogle) has done its job. Web never fires this -
  // Capacitor's App plugin only emits appUrlOpen on native platforms.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(GOOGLE_OAUTH_NATIVE_REDIRECT)) return
      await Browser.close()

      const callbackUrl = new URL(url)
      const code = callbackUrl.searchParams.get('code')
      const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      // Supabase's default flow (PKCE) returns `code`; `access_token`/
      // `refresh_token` covers the implicit flow in case that's ever
      // configured instead - handle both rather than assuming one.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError(error.message)
          return
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setError(error.message)
          return
        }
      } else {
        setError('Google sign-in failed. Please try again.')
        return
      }

      navigate(redirectTo, { replace: true })
    })

    return () => {
      listenerPromise.then((listener) => listener.remove())
    }
  }, [navigate, redirectTo])

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

    if (Capacitor.isNativePlatform()) {
      // Per Apple Guideline 4, auth has to stay in-app rather than kicking
      // out to full Safari - skipBrowserRedirect gets us the OAuth URL to
      // open ourselves in an ASWebAuthenticationSession sheet (Browser.open)
      // instead of Supabase's default window.location redirect. The
      // appUrlOpen listener above picks up the result.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: GOOGLE_OAUTH_NATIVE_REDIRECT,
          skipBrowserRedirect: true,
        },
      })
      if (error) {
        setError(error.message)
        return
      }
      await Browser.open({ url: data.url })
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Same reasoning as `redirectTo` above - window.location.origin alone
      // is "/", which would land a freshly authenticated user on the public
      // marketing page instead of the app.
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) setError(error.message)
  }

  async function handleApple() {
    setError(null)
    if (Capacitor.isNativePlatform()) {
      try {
        const signInResult = await AppleSignIn.signIn()
        console.log('[Apple Sign-In] native signIn() result:', signInResult)
        const { idToken, user } = signInResult
        window.alert(
          `[1] signIn() resolved. idToken length: ${idToken ? idToken.length : 'none'}, user: ${user ?? 'none'}`
        )

        window.alert('[2] calling supabase.auth.signInWithIdToken()...')
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: idToken,
        })
        window.alert(
          `[3] signInWithIdToken() resolved. session exists: ${!!data?.session}, error: ${error ? error.message : 'none'}`
        )
        if (error) {
          console.error('[Apple Sign-In] signInWithIdToken() error:', error)
          setError(
            error.message ||
              (error.status || error.code
                ? `Sign-in failed (status ${error.status ?? 'unknown'}${error.code ? `, code ${error.code}` : ''})`
                : null) ||
              'Apple sign-in failed. Please try again.'
          )
          return
        }
        navigate(redirectTo, { replace: true })
      } catch (err) {
        console.error('[Apple Sign-In] native flow threw:', err)
        window.alert(`[4] threw: ${JSON.stringify(err)}`)
        const message =
          (err && typeof err === 'object' && (err.message || err.errorMessage)) ||
          (typeof err === 'string' ? err : null) ||
          (err ? JSON.stringify(err) : null) ||
          'Apple sign-in failed. Please try again.'
        setError(message)
      }
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
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

          <button type="button" className="login-btn-secondary" onClick={handleApple}>
            Continue with Apple
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
        <div className="login-preview-content">
          <div className="login-preview-icon-layer" aria-hidden="true">
            {PANEL_ICONS.map((Icon, i) => (
              <Icon
                key={i}
                className={`login-preview-icon ${i === phraseIndex ? 'active' : ''}`}
              />
            ))}
          </div>
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
