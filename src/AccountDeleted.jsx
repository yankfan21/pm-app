import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import ConfidantLogo from './ConfidantLogo'

// Public route at /account-deleted - the redirect target after
// DeleteAccountFlow.jsx / mobile/MobileDeleteAccount.jsx sign the user out
// post-deletion. Deliberately its own distinct page rather than just
// bouncing to /login, so it's unambiguous the deletion actually completed
// (see Login.jsx's own comment about /login being "welcome back" copy - that
// would read as if nothing happened). Mounted as a pre-auth sibling of
// /login in App.jsx: there is no session left by the time this renders.
function AccountDeleted() {
  // Same reasoning as Login.jsx/ForgotPassword.jsx/ResetPassword.jsx - this
  // is a full-bleed pre-auth screen, so drop the centered/width-capped
  // #root constraint while mounted.
  useEffect(() => {
    document.body.classList.add('login-route')
    return () => document.body.classList.remove('login-route')
  }, [])

  return (
    <div className="login-page">
      <div className="login-panel login-panel-form">
        <div className="login-panel-form-inner">
          <div className="login-brand">
            <ConfidantLogo size={40} />
            <span className="login-brand-name">
              Confidant<span className="brand-name-accent">PM</span>
            </span>
          </div>

          <h1 className="login-heading">Your account has been deleted</h1>
          <p className="login-subtext">
            Your account and any projects only you owned have been permanently removed. If you
            shared a project with others, ownership was transferred before your account was
            deleted.
          </p>

          <p className="login-footer-link">
            <Link to="/">Back to ConfidantPM</Link>
          </p>
        </div>
      </div>

      <div className="login-panel login-panel-preview">
        <div className="login-preview-content">
          <div className="login-preview-headline-frame">
            <p className="login-preview-headline active">Thanks for using ConfidantPM.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountDeleted
