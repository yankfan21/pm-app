import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { TOUR_STEPS } from '../tourSteps'

// Same destination as the home page's CTAs (see Marketing.jsx).
const SIGN_UP_PATH = '/login?mode=signup'

// The home page's product walkthrough: five slides over the page, so a visitor
// never leaves it. Closing returns them to the hero. Every slide carries the
// sign-up button. Only mounted while open, so it adds nothing to the
// prerendered markup.
function HowItWorksModal({ onClose }) {
  const [step, setStep] = useState(0)
  const dialogRef = useRef(null)
  const total = TOUR_STEPS.length
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  // Focus moves into the dialog, the page behind stops scrolling, and both
  // are put back on close.
  useEffect(() => {
    const opener = document.activeElement
    const scrollable = document.documentElement
    const previousOverflow = scrollable.style.overflow
    scrollable.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      scrollable.style.overflow = previousOverflow
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, total - 1))
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, total])

  return createPortal(
    <div
      className="how-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="how-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="how-top">
          <p className="how-count">
            Step {step + 1} of {total}
          </p>
          <div className="how-progress" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span key={s.title} className={i <= step ? 'on' : ''} />
            ))}
          </div>
          <button type="button" className="how-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <h2 id="how-title" className="how-title">{current.title}</h2>
        <p className="how-body">{current.body}</p>

        <div className={current.narrow ? 'how-shot how-shot-narrow' : 'how-shot'}>
          <img src={current.img} alt={current.alt} />
        </div>

        <div className="how-actions">
          <button type="button" className="btn-secondary" disabled={isFirst} onClick={() => setStep(step - 1)}>
            Back
          </button>
          <span className="how-actions-spacer" />
          {!isLast && (
            <button type="button" className="btn-secondary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          )}
          <Link to={SIGN_UP_PATH} className="marketing-cta how-cta">
            Try ConfidantPM free
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default HowItWorksModal
