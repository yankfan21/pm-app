import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('sign-in') // 'sign-in' | 'sign-up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const redirectTo = location.state?.from?.pathname || '/'

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

    const { error } = await supabase.auth.signUp({ email, password })
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
    <div className="app">
      <AppHeader />

      <div className="login-card">
        <div className="login-toggle">
          <button
            type="button"
            className={mode === 'sign-in' ? 'selected' : ''}
            onClick={() => switchMode('sign-in')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={mode === 'sign-up' ? 'selected' : ''}
            onClick={() => switchMode('sign-up')}
          >
            Sign Up
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
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

          {error && <p className="error">{error}</p>}
          {info && <p className="charter-status">{info}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="login-divider">or</div>

        <button type="button" className="btn-secondary login-google-btn" onClick={handleGoogle}>
          Continue with Google
        </button>
      </div>
    </div>
  )
}

export default Login
