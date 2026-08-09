import { Link, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import ConfidantLogo from './ConfidantLogo'

// Where both CTAs land. There is no /signup route in App.jsx - the Login
// screen's "Create an account" is an in-page mode toggle - so this is the
// Login page plus the query param that makes it open in that mode rather
// than on the sign-in form (see Login.jsx's `mode` initial state).
const SIGN_UP_PATH = '/login?mode=signup'

// Hardcoded rather than new Date().getFullYear(): this page is prerendered at
// build time (see scripts/prerender.mjs) and hydrated in the browser, so a
// value that can change between those two moments is a hydration mismatch
// waiting for New Year's Eve.
//
// Built as one whole string rather than JSX like `© {YEAR} ConfidantPM.` for
// the same reason: that form is three sibling text nodes, and react-snap
// snapshots the *DOM*, where adjacent text nodes have already merged into one.
// React then hydrates expecting three and errors (#418, "text content did not
// match"). Every other text node on this page is a single JSX string or a
// single expression, which is what keeps hydration clean.
const COPYRIGHT_LINE = '© 2026 ConfidantPM. All rights reserved.'

const DIFFERENTIATORS = [
  {
    title: 'It reads before it talks.',
    body: 'The assistant reviews your charter, risk log, and past decisions before it ever suggests anything — no generic advice, no starting from scratch every session.',
  },
  {
    title: "It asks, it doesn't assume.",
    body: 'Structured questions guide every document it drafts. You stay the decision-maker; the assistant never acts on its own.',
  },
  {
    title: 'It fits how you actually run projects.',
    body: 'Waterfall, Agile, or Hybrid — the tool adapts its structure to your methodology instead of forcing one framework on everyone.',
  },
]

const CAPABILITIES = [
  'Project charters & requirements briefs',
  'Risk & issue logs',
  'Sprint planning & velocity tracking',
  'Status updates & communications drafts',
  'Post-mortems & project evaluations',
]

// The public front door at "/" - the only route in the app that renders
// real content with no session. Deliberately mounted outside both
// RequireAuth and DeviceModeGate (see App.jsx), the same way
// /forgot-password and /reset-password are: there is no session to guard,
// and it has to render at any viewport width rather than bouncing a
// phone-width visitor into the app's mobile tree at /m/dashboard.
//
// Styling deliberately reuses the Login screen's fixed dark brand palette
// (#161c27 / #1a2130 page + panel, --accent-strong CTA fills, #e2e8f0 /
// #94a3b8 text, the same 8px radii and system-ui stack) rather than
// inventing a marketing-only look - a visitor should not notice a seam
// between this page and the sign-in screen it hands off to.
function Marketing() {
  // Native builds (Capacitor - see capacitor.config.json, webDir: dist)
  // ship this same bundle and boot at "/", so without this they would open
  // on the marketing page instead of the app. Send them into the authed
  // tree and let RequireAuth do what it already does: an unauthenticated
  // user gets bounced to /login with /dashboard stashed as `from` (so
  // signing in lands them back here), and a signed-in user goes straight
  // through. Redirecting to /login unconditionally instead would show the
  // sign-in form to an already-signed-in user, since Login.jsx has no
  // has-session guard of its own.
  if (Capacitor.isNativePlatform()) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <Link to="/" className="marketing-nav-brand">
          <ConfidantLogo size={32} />
          <span className="marketing-nav-name">ConfidantPM</span>
        </Link>
        <Link to="/login" className="marketing-nav-signin">
          Sign in
        </Link>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero">
          <h1 className="marketing-hero-headline">
            Project management that actually knows your project.
          </h1>
          <p className="marketing-hero-sub">
            ConfidantPM&apos;s assistant reads your documents, asks the right questions, and
            never moves without your sign-off. Built for Waterfall, Agile, and Hybrid teams —
            no bolted-on AI gimmicks.
          </p>
          <Link to={SIGN_UP_PATH} className="marketing-cta">
            Start free — no credit card
          </Link>
        </section>

        <section className="marketing-section">
          <h2 className="marketing-section-heading">How it&apos;s different</h2>
          <ul className="marketing-cards">
            {DIFFERENTIATORS.map((item) => (
              <li key={item.title} className="marketing-card">
                <h3 className="marketing-card-title">{item.title}</h3>
                <p className="marketing-card-body">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="marketing-section marketing-boutique">
          <h2 className="marketing-section-heading">Built for boutique teams</h2>
          <p className="marketing-boutique-body">
            ConfidantPM is built for boutique shops and independent PMs — not enterprise
            procurement cycles. One flat price per account, not per seat. No SSO paperwork, no
            admin bloat. Just a tool that works the way a small, sharp team actually works.
          </p>
        </section>

        <section className="marketing-section">
          <h2 className="marketing-section-heading">What it handles</h2>
          <ul className="marketing-capabilities">
            {CAPABILITIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="marketing-footer">
        <p className="marketing-footer-tagline">Structure the chaos. One step at a time.</p>
        <Link to={SIGN_UP_PATH} className="marketing-cta">
          Start free
        </Link>
        <p className="marketing-copyright">{COPYRIGHT_LINE}</p>
      </footer>
    </div>
  )
}

export default Marketing
