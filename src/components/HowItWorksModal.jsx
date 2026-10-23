import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { TOUR_STEPS } from '../tourSteps'
import TourMedia, { pickVideoSrc, useReducedMotion } from './TourMedia'

// Same destination as the home page's CTAs (see Marketing.jsx).
const SIGN_UP_PATH = '/login?mode=signup'

// The home page's product walkthrough: five short clips over the page, so a
// visitor never leaves it. It plays straight through (each clip hands over to
// the next, the title and caption swap with it) and stops on the last frame;
// nobody has to click. Tapping the picture pauses, the bar segments jump to a
// step, and Back/Next stay for those who want them. With reduced motion it is
// manual stills instead. Every slide carries the sign-up button. Only mounted
// while open, so it adds nothing to the prerendered markup.
function HowItWorksModal({ onClose }) {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)
  const [run, setRun] = useState(0)
  const reduced = useReducedMotion()
  const dialogRef = useRef(null)
  const total = TOUR_STEPS.length
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === total - 1
  const playing = !reduced && Boolean(current.video)

  // Jumping to a step (segment, Back, Next, arrow keys, Watch again) restarts
  // that clip and resumes playback.
  const goTo = useCallback((i) => {
    setStep(Math.max(0, Math.min(i, total - 1)))
    setProgress(0)
    setEnded(false)
    setPaused(false)
    setRun((n) => n + 1)
  }, [total])

  const onClipEnded = useCallback(() => {
    if (isLast) {
      setEnded(true)
      setProgress(1)
    } else {
      goTo(step + 1)
    }
  }, [isLast, step, goTo])

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
      else if (e.key === 'ArrowRight') goTo(step + 1)
      else if (e.key === 'ArrowLeft') goTo(step - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, goTo, step])

  const nextStep = TOUR_STEPS[step + 1]
  const segmentFill = (i) => {
    if (i < step) return 1
    if (i === step) return playing ? progress : 1
    return 0
  }

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
          <div className="how-progress">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className="how-seg"
                onClick={() => goTo(i)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
              >
                <i style={{ width: `${segmentFill(i) * 100}%` }} />
              </button>
            ))}
          </div>
          <button type="button" className="how-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <h2 id="how-title" className="how-title">{current.title}</h2>
        <p className="how-body">{current.body}</p>

        <div
          className={`how-shot${playing ? ' playable' : ''}`}
          onClick={playing && !ended ? () => setPaused((p) => !p) : undefined}
        >
          <TourMedia
            key={`${step}-${run}`}
            step={current}
            paused={paused}
            onEnded={onClipEnded}
            onProgress={setProgress}
            onBlocked={() => setPaused(true)}
          />
          {playing && paused && !ended && (
            <span className="how-shot-play" aria-hidden="true">
              <span>&#9654;</span>
            </span>
          )}
        </div>
        {playing && nextStep?.video && !ended && (
          <video className="how-preload" src={pickVideoSrc(nextStep.video)} preload="auto" muted hidden />
        )}

        <div className="how-actions">
          <button type="button" className="btn-secondary" disabled={isFirst} onClick={() => goTo(step - 1)}>
            Back
          </button>
          {playing && !ended && (
            <button type="button" className="btn-secondary" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
          <span className="how-actions-spacer" />
          {ended ? (
            <button type="button" className="btn-secondary" onClick={() => goTo(0)}>
              Watch again
            </button>
          ) : (
            !isLast && (
              <button type="button" className="btn-secondary" onClick={() => goTo(step + 1)}>
                Next
              </button>
            )
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
