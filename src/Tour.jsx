import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import ConfidantLogo from './ConfidantLogo'
import { TOUR_STEPS } from './tourSteps'
import TourMedia from './components/TourMedia'

// Same destination as the home page's CTAs (see Marketing.jsx).
const SIGN_UP_PATH = '/login?mode=signup'

function Tour() {
  useEffect(() => {
    const previous = document.title
    document.title = 'See how ConfidantPM works'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="marketing-page tour-page">
      <header className="marketing-nav">
        <Link to="/" className="marketing-nav-brand">
          <ConfidantLogo size={32} />
          <span className="marketing-nav-name">Confidant<span className="brand-name-accent">PM</span></span>
        </Link>
        <Link to="/login" className="marketing-nav-signin">
          Sign in
        </Link>
      </header>

      <main className="marketing-main">
        <section className="tour-intro">
          <h1 className="marketing-hero-headline">See how ConfidantPM works</h1>
          <p className="marketing-hero-sub">
            Five steps from a blank page to a plan you trust. Every screen below is the real app.
          </p>
          <Link to={SIGN_UP_PATH} className="marketing-cta">
            Try ConfidantPM free
          </Link>
        </section>

        <ol className="tour-steps">
          {TOUR_STEPS.map((step, i) => (
            <li key={step.title} className="tour-step">
              <div className="tour-copy">
                <span className="tour-num" aria-hidden="true">{i + 1}</span>
                <h2 className="tour-title">{step.title}</h2>
                <p className="tour-body">{step.body}</p>
              </div>
              <figure className="tour-frame">
                <div className="tour-frame-bar" aria-hidden="true">
                  <i /><i /><i />
                  <span>{step.label}</span>
                </div>
                <div className="tour-shot">
                  <TourMedia step={step} lazy loop playWhenVisible />
                </div>
              </figure>
            </li>
          ))}
        </ol>
      </main>

      <section className="tour-close">
        <h2 className="tour-close-title">Ready to try it on your own project?</h2>
        <p className="tour-close-body">Free to start. Nothing the assistant drafts is final until you accept it.</p>
        <Link to={SIGN_UP_PATH} className="marketing-cta">
          Try ConfidantPM free
        </Link>
      </section>

      <footer className="marketing-footer">
        <p className="marketing-footer-links">
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </p>
      </footer>
    </div>
  )
}

export default Tour
