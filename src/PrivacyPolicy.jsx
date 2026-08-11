import { Link } from 'react-router-dom'
import ConfidantLogo from './ConfidantLogo'

// Same reasoning as Marketing.jsx's COPYRIGHT_LINE: whole string rather than
// JSX with an interpolated year, so nothing here can drift between build and
// render. This page is not prerendered (see scripts/prerender.mjs - only "/"
// is), but it shares Marketing's chrome and there is no reason for the two to
// diverge.
const COPYRIGHT_LINE = '© 2026 ConfidantPM. All rights reserved.'
const LAST_UPDATED = 'Last updated: August 11, 2026'
const CONTACT_EMAIL = 'scott@confidantpm.com'

const USES = [
  'Provide and operate the ConfidantPM service',
  'Authenticate your account and secure your data',
  'Send account-related emails (such as sign-up verification)',
  'Power the assistant feature within the app',
]

const THIRD_PARTIES = [
  { name: 'Supabase', purpose: 'database hosting and authentication' },
  { name: 'Anthropic', purpose: 'powers the in-app assistant feature' },
  { name: 'Resend', purpose: 'sends transactional emails (such as account verification)' },
  { name: 'Vercel', purpose: 'application hosting' },
]

// Public legal page at /privacy. Mounted alongside /login and the other
// pre-auth routes in App.jsx - outside both RequireAuth and DeviceModeGate,
// since a visitor with no session has to be able to read it at any viewport
// width, and app-store review needs it reachable from a native build too
// (which is why there is no Capacitor redirect here, unlike Marketing.jsx).
//
// Reuses Marketing's page chrome (.marketing-page / -nav / -main / -footer)
// so the visitor does not cross a visual seam leaving the front door; the
// .legal-* classes below are the only page-specific styling.
function PrivacyPolicy() {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <Link to="/" className="marketing-nav-brand">
          <ConfidantLogo size={32} />
          <span className="marketing-nav-name">Confidant<span className="brand-name-accent">PM</span></span>
        </Link>
        <Link to="/login" className="marketing-nav-signin">
          Sign in
        </Link>
      </header>

      <main className="marketing-main legal-main">
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">{LAST_UPDATED}</p>

        <p className="legal-body">
          ConfidantPM (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides project
          management software for boutique teams and independent project managers. This Privacy
          Policy explains what information we collect and how we use it.
        </p>

        <section className="legal-section">
          <h2 className="legal-heading">Information We Collect</h2>
          <p className="legal-body">
            <strong className="legal-term">Account Information:</strong> When you create an
            account, we collect your name and email address.
          </p>
          <p className="legal-body">
            <strong className="legal-term">Content You Create:</strong> We store the project
            information you enter into ConfidantPM, including projects, tasks, documents, and
            related content, so the application can function and so our AI assistant can
            reference your prior project details.
          </p>
          <p className="legal-body">
            <strong className="legal-term">Usage Data:</strong> We may collect basic technical
            information (such as log data) to maintain and improve the service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-heading">How We Use Information</h2>
          <p className="legal-body">We use the information above to:</p>
          <ul className="legal-list">
            {USES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="legal-body">
            We do not sell your personal information, and we do not use your data for
            advertising.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-heading">Third-Party Services</h2>
          <p className="legal-body">
            We use the following third-party services to operate ConfidantPM:
          </p>
          <ul className="legal-list">
            {THIRD_PARTIES.map((item) => (
              <li key={item.name}>
                <strong className="legal-term">{item.name}</strong> — {item.purpose}
              </li>
            ))}
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-heading">Data Retention</h2>
          <p className="legal-body">
            We retain your account and project data for as long as your account is active. You
            may request deletion of your account and associated data by contacting us.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-heading">Your Rights</h2>
          <p className="legal-body">
            You may contact us at any time to access, correct, or delete your personal
            information.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-heading">Contact Us</h2>
          <p className="legal-body">
            If you have questions about this Privacy Policy, contact us at{' '}
            <a className="legal-link" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="marketing-footer">
        <p className="marketing-footer-links">
          <Link to="/">Home</Link>
        </p>
        <p className="marketing-copyright">{COPYRIGHT_LINE}</p>
      </footer>
    </div>
  )
}

export default PrivacyPolicy
